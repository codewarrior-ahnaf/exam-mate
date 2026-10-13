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

interface CellWithBounds {
  text: string;
  minX: number;
  maxX: number;
}

function cellValue(row: string[], column: number | undefined): string {
  if (column === undefined) return "";
  return (row[column] ?? "").trim();
}

function clusterBandIntoCellsWithBounds(tokens: PdfToken[], gapThreshold = 8): CellWithBounds[] {
  const cells: CellWithBounds[] = [];
  let currentTokens: PdfToken[] = [];
  let lastRight = -1;

  for (const tok of tokens) {
    const text = tok.str.trim();
    if (!text) continue;
    const tokWidth = tok.width > 0 ? tok.width : text.length * 6;
    const gap = lastRight >= 0 ? tok.x - lastRight : 0;

    if (currentTokens.length > 0 && gap > gapThreshold) {
      const minX = Math.min(...currentTokens.map((t) => t.x));
      const maxX = Math.max(...currentTokens.map((t) => t.x + (t.width > 0 ? t.width : t.str.length * 6)));
      cells.push({
        text: currentTokens.map((t) => t.str.trim()).join(" "),
        minX,
        maxX,
      });
      currentTokens = [tok];
    } else {
      currentTokens.push(tok);
    }
    lastRight = tok.x + tokWidth;
  }

  if (currentTokens.length > 0) {
    const minX = Math.min(...currentTokens.map((t) => t.x));
    const maxX = Math.max(...currentTokens.map((t) => t.x + (t.width > 0 ? t.width : t.str.length * 6)));
    cells.push({
      text: currentTokens.map((t) => t.str.trim()).join(" "),
      minX,
      maxX,
    });
  }

  return cells;
}

function alignTokensToColumns(tokens: PdfToken[], splitXs: number[]): string[] {
  const colCount = splitXs.length + 1;
  const colTokens: PdfToken[][] = Array.from({ length: colCount }, () => []);

  for (const tok of tokens) {
    let colIdx = splitXs.length;
    for (let i = 0; i < splitXs.length; i++) {
      if (tok.x < splitXs[i]) {
        colIdx = i;
        break;
      }
    }
    colTokens[colIdx].push(tok);
  }

  return colTokens.map((toks) => toks.map((t) => t.str.trim()).join(" ").trim());
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
  let activeStartTime = "";
  let activeEndTime = "";

  let savedHeader: ReturnType<typeof findHeaderRow> | undefined;
  let savedSplitXs: number[] | undefined;

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

    if (!bands.length) continue;

    // Cluster each band to find cells and their physical X bounds
    const bandCellData = bands.map((band) => {
      band.tokens.sort((a, b) => a.x - b.x);
      return clusterBandIntoCellsWithBounds(band.tokens, 8);
    });

    const pageRows = bandCellData.map((b) => b.map((c) => c.text));

    // Check if this page has a table header
    const pageHeader = findHeaderRow(pageRows, !activeDate);
    let currentHeader = pageHeader;
    let currentSplitXs: number[] | undefined;

    if (pageHeader && pageHeader.columns.courseCode !== undefined) {
      // Calculate column split X coordinates from the header cells
      const headerBandIdx = pageHeader.index;
      const headerCells = bandCellData[headerBandIdx];
      if (headerCells && headerCells.length > 1) {
        currentSplitXs = [];
        for (let i = 0; i < headerCells.length - 1; i++) {
          const split = (headerCells[i].maxX + headerCells[i + 1].minX) / 2;
          currentSplitXs.push(split);
        }
        savedHeader = pageHeader;
        savedSplitXs = currentSplitXs;
      }
    } else if (savedHeader && savedSplitXs) {
      // Reuse table header columns and X-splits from previous page
      currentHeader = savedHeader;
      currentSplitXs = savedSplitXs;
    }

    if (currentHeader && currentHeader.columns.courseCode !== undefined && currentSplitXs) {
      const startBandIdx = pageHeader ? pageHeader.index + (pageHeader.headerRowCount ?? 1) : 0;

      for (let bIdx = startBandIdx; bIdx < bands.length; bIdx++) {
        const band = bands[bIdx];
        const row = alignTokensToColumns(band.tokens, currentSplitXs);

        // 1. Course code
        let courseCode = cellValue(row, currentHeader.columns.courseCode);
        if (!courseCode) {
          for (const cell of row) {
            const foundCodes = extractCourseCodes(cell);
            if (foundCodes.length > 0) {
              courseCode = foundCodes[0].code;
              break;
            }
          }
        }

        // 2. Date
        const dateCell = cellValue(row, currentHeader.columns.date);
        if (dateCell && dateCell !== activeDate) {
          activeDate = dateCell;
          activeTime = "";
          activeStartTime = "";
          activeEndTime = "";
        } else if (!activeDate) {
          const detected = extractDateFromText(row.join(" "));
          if (detected) activeDate = detected.raw;
        }
        const rawDate = dateCell || activeDate;

        // 3. Time
        const timeCell = cellValue(row, currentHeader.columns.time);
        const startCell = cellValue(row, currentHeader.columns.startTime);
        const endCell = cellValue(row, currentHeader.columns.endTime);

        if (timeCell) activeTime = timeCell;
        if (startCell) activeStartTime = startCell;
        if (endCell) activeEndTime = endCell;

        if (!timeCell && !startCell && !endCell && !activeTime && (!activeStartTime || !activeEndTime)) {
          const detectedTime = extractTimeFromText(row.join(" "));
          if (detectedTime) {
            activeTime = detectedTime.raw;
            activeStartTime = detectedTime.start;
            activeEndTime = detectedTime.end;
          }
        }

        const rawTime = timeCell || activeTime;
        const rawStartTime = startCell || activeStartTime;
        const rawEndTime = endCell || activeEndTime;

        if (!courseCode || !rawDate) continue;

        const exam = normalizeRow({
          courseCode,
          courseTitle: cellValue(row, currentHeader.columns.courseTitle) || "Exam",
          date: rawDate,
          time: rawTime,
          startTime: rawStartTime,
          endTime: rawEndTime,
          faculty: cellValue(row, currentHeader.columns.faculty) || "Faculty not listed",
          program: cellValue(row, currentHeader.columns.program) || "General",
        });
        if (exam) exams.set(exam.id, exam);
      }
    } else {
      // Dynamic row scanning fallback
      for (const band of bands) {
        const fullRowText = band.tokens.map((t) => t.str).join(" ");
        const detectedDate = extractDateFromText(fullRowText);
        if (detectedDate) activeDate = detectedDate.raw;

        const detectedTime = extractTimeFromText(fullRowText);
        if (detectedTime) {
          activeTime = detectedTime.raw;
          activeStartTime = detectedTime.start;
          activeEndTime = detectedTime.end;
        }

        const codes = extractCourseCodes(fullRowText);
        if (codes.length > 0 && (detectedDate || activeDate) && (detectedTime || activeTime || activeStartTime)) {
          const examDate = detectedDate ? detectedDate.raw : activeDate;
          const examTime = detectedTime ? detectedTime.raw : activeTime;

          for (const c of codes) {
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
              startTime: activeStartTime,
              endTime: activeEndTime,
              faculty: "Faculty not listed",
              program,
            });
            if (exam) exams.set(exam.id, exam);
          }
        }
      }
    }
  }

  return [...exams.values()];
}
