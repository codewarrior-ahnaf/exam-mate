if (typeof Uint8Array !== "undefined" && !(Uint8Array.prototype as unknown as { toHex?: unknown }).toHex) {
  (Uint8Array.prototype as unknown as { toHex: () => string }).toHex = function (this: Uint8Array) {
    return Array.from(this)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");
  };
}

import type { ParsedExam } from "@/lib/parsers/normalize";
import {
  extractCleanTitle,
  extractCourseCodes,
  extractDateFromText,
  extractTimeFromText,
  findHeaderRow,
  normalizeRow,
} from "@/lib/parsers/normalize";

interface ExtractedTextItem {
  str: string;
  width?: number;
  height?: number;
  transform: number[];
}

function isTextItem(item: unknown): item is ExtractedTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    "transform" in item &&
    Array.isArray((item as { transform: unknown }).transform)
  );
}

interface PdfToken {
  str: string;
  x: number;
  y: number;
  width: number;
}

interface RowBand {
  anchorY: number;
  tokens: PdfToken[];
}

function cellValue(row: string[], column: number | undefined): string {
  if (column === undefined) return "";
  return (row[column] ?? "").trim();
}

function clusterBandIntoCells(tokens: PdfToken[], gapThreshold = 8): string[] {
  const cells: string[] = [];
  let currentTokens: PdfToken[] = [];
  let lastRight = -1;

  for (const tok of tokens) {
    const text = tok.str.trim();
    if (!text) continue;
    const tokWidth = tok.width > 0 ? tok.width : text.length * 6;
    const gap = lastRight >= 0 ? tok.x - lastRight : 0;

    // A gap > 8px represents a column separator in routine tables
    if (currentTokens.length > 0 && gap > gapThreshold) {
      cells.push(currentTokens.map((t) => t.str.trim()).join(" "));
      currentTokens = [tok];
    } else {
      currentTokens.push(tok);
    }
    lastRight = tok.x + tokWidth;
  }

  if (currentTokens.length > 0) {
    cells.push(currentTokens.map((t) => t.str.trim()).join(" "));
  }

  return cells;
}

export async function parsePdfFile(file: File): Promise<ParsedExam[]> {
  const pdfjsLib = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;

  const exams = new Map<string, ParsedExam>();
  let activeDate = "";
  let activeTime = "";

  for (let pageNum = 1; pageNum <= numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const rawItems = (textContent.items as unknown[]).filter(isTextItem);

    const tokens: PdfToken[] = rawItems
      .map((it) => ({
        str: it.str,
        x: it.transform[4] ?? 0,
        y: it.transform[5] ?? 0,
        width: typeof it.width === "number" ? it.width : 0,
      }))
      .filter((t) => t.str.trim().length > 0);

    // Sort tokens top-to-bottom (Y descending)
    tokens.sort((a, b) => b.y - a.y);

    // Group into horizontal row bands (preventing baseline creep with fixed anchorY)
    const bands: RowBand[] = [];
    const Y_TOLERANCE = 5.0;

    for (const tok of tokens) {
      const lastBand = bands[bands.length - 1];
      if (lastBand && Math.abs(tok.y - lastBand.anchorY) <= Y_TOLERANCE) {
        lastBand.tokens.push(tok);
      } else {
        bands.push({ anchorY: tok.y, tokens: [tok] });
      }
    }

    // Convert each band to cells
    const pageRows: string[][] = [];
    for (const band of bands) {
      band.tokens.sort((a, b) => a.x - b.x);
      const cells = clusterBandIntoCells(band.tokens, 8);
      if (cells.length) pageRows.push(cells);
    }

    if (!pageRows.length) continue;

    // Check if this page contains a recognizable table header
    const header = findHeaderRow(pageRows, !activeDate);

    if (header && header.columns.courseCode !== undefined) {
      // Process using recognized header columns (matching Excel-level precision)
      for (const row of pageRows.slice(header.index + 1)) {
        const courseCode = cellValue(row, header.columns.courseCode);
        const dateCell = cellValue(row, header.columns.date);
        if (dateCell && dateCell !== activeDate) {
          activeDate = dateCell;
          activeTime = "";
        }
        const rawDate = dateCell || activeDate;

        const timeCell = cellValue(row, header.columns.time);
        if (timeCell) {
          activeTime = timeCell;
        }
        const rawTime = timeCell || activeTime;

        if (!courseCode || !rawDate) continue;

        const exam = normalizeRow({
          courseCode,
          courseTitle: cellValue(row, header.columns.courseTitle) || "Exam",
          date: rawDate,
          time: rawTime,
          startTime: cellValue(row, header.columns.startTime),
          endTime: cellValue(row, header.columns.endTime),
          faculty: cellValue(row, header.columns.faculty) || "Faculty not listed",
          program: cellValue(row, header.columns.program) || "General",
        });
        if (exam) exams.set(exam.id, exam);
      }
    } else {
      // Dynamic row scanning fallback
      for (const row of pageRows) {
        const fullRowText = row.join(" ");

        // Check for Date in this row
        const detectedDate = extractDateFromText(fullRowText);
        if (detectedDate) activeDate = detectedDate.raw;

        // Check for Time in this row
        const detectedTime = extractTimeFromText(fullRowText);
        if (detectedTime) activeTime = detectedTime.raw;

        const examDate = detectedDate ? detectedDate.raw : activeDate;
        const examTime = detectedTime ? detectedTime.raw : activeTime;

        // Method 1: Check cell-by-cell for course code
        let matchedAnyInCells = false;

        row.forEach((cell, cellIdx) => {
          const cellCodes = extractCourseCodes(cell);
          if (!cellCodes.length) return;

          matchedAnyInCells = true;
          for (const c of cellCodes) {
            // Find course title: check adjacent cell first
            let title = "";
            if (cellIdx + 1 < row.length) {
              const nextCell = row[cellIdx + 1].trim();
              if (
                nextCell.length > 2 &&
                !extractDateFromText(nextCell) &&
                !extractTimeFromText(nextCell) &&
                !extractCourseCodes(nextCell).length
              ) {
                title = nextCell;
              }
            }
            if (!title) {
              title = extractCleanTitle(fullRowText, c.raw, detectedDate?.raw, detectedTime?.raw);
            }

            // Try to extract program if present in row
            const progMatch = fullRowText.match(
              /\b(B\.?Sc(?:\s+in)?\s+[A-Za-z]+|CSE|EEE|BBA|ENG|LLB|PHR|ECO|TEX)\b/i,
            );
            const program = progMatch ? progMatch[0] : "General";

            if (examDate && examTime) {
              const exam = normalizeRow({
                courseCode: c.code,
                courseTitle: title,
                date: examDate,
                time: examTime,
                faculty: "Faculty not listed",
                program,
              });
              if (exam) exams.set(exam.id, exam);
            }
          }
        });

        // Method 2: Fallback for rows where tokens were not separated into distinct cells
        if (!matchedAnyInCells) {
          const rowCodes = extractCourseCodes(fullRowText);
          if (rowCodes.length > 0 && examDate && examTime) {
            for (const c of rowCodes) {
              const title = extractCleanTitle(fullRowText, c.raw, detectedDate?.raw, detectedTime?.raw);
              const progMatch = fullRowText.match(
                /\b(B\.?Sc(?:\s+in)?\s+[A-Za-z]+|CSE|EEE|BBA|ENG|LLB|PHR|ECO|TEX)\b/i,
              );
              const program = progMatch ? progMatch[0] : "General";

              const exam = normalizeRow({
                courseCode: c.code,
                courseTitle: title,
                date: examDate,
                time: examTime,
                faculty: "Faculty not listed",
                program,
              });
              if (exam) exams.set(exam.id, exam);
            }
          }
        }
      }
    }
  }

  return [...exams.values()];
}
