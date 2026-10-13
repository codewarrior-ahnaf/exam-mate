import * as mammoth from "mammoth";
import type { ParsedExam } from "@/lib/parsers/normalize";
import {
  extractCleanTitle,
  extractCourseCodes,
  extractDateFromText,
  extractTimeFromText,
  findHeaderRow,
  normalizeRow,
} from "@/lib/parsers/normalize";

function extractPlainText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i];
    if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
      result += String.fromCharCode(code);
    } else if (result.length && result[result.length - 1] !== "\n") {
      result += "\n";
    }
  }
  return result;
}

interface HtmlBlock {
  type: "text" | "table";
  text?: string;
  rows?: string[][];
}

function parseHtmlBlocks(html: string): HtmlBlock[] {
  const blockRegex = /<(table|p|h[1-6]|li|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  const blocks: HtmlBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const content = match[2];

    if (tag === "table") {
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows: string[][] = [];
      let trMatch: RegExpExecArray | null;

      while ((trMatch = trRegex.exec(content)) !== null) {
        const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const row: string[] = [];
        let tdMatch: RegExpExecArray | null;

        while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
          const text = tdMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          row.push(text);
        }
        if (row.length > 0) rows.push(row);
      }
      if (rows.length > 0) blocks.push({ type: "table", rows });
    } else {
      const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ type: "text", text });
    }
  }

  return blocks;
}

function cellValue(row: string[], column: number | undefined): string {
  if (column === undefined) return "";
  return (row[column] ?? "").trim();
}

export async function parseDocxFile(file: File): Promise<ParsedExam[]> {
  const arrayBuffer = await file.arrayBuffer();
  let html = "";
  let plainTextFallback = "";

  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    html = result.value;
  } catch {
    plainTextFallback = extractPlainText(arrayBuffer);
  }

  const exams = new Map<string, ParsedExam>();
  let activeDate = "";
  let activeTime = "";

  if (html) {
    const blocks = parseHtmlBlocks(html);

    for (const block of blocks) {
      if (block.type === "text" && block.text) {
        const text = block.text;
        const detectedDate = extractDateFromText(text);
        if (detectedDate) activeDate = detectedDate.raw;

        const detectedTime = extractTimeFromText(text);
        if (detectedTime) activeTime = detectedTime.raw;

        const codes = extractCourseCodes(text);
        if (codes.length > 0 && (detectedDate || activeDate) && (detectedTime || activeTime)) {
          const examDate = detectedDate ? detectedDate.raw : activeDate;
          const examTime = detectedTime ? detectedTime.raw : activeTime;

          for (const c of codes) {
            const title = extractCleanTitle(text, c.raw, detectedDate?.raw, detectedTime?.raw);
            const exam = normalizeRow({
              courseCode: c.code,
              courseTitle: title,
              date: examDate,
              time: examTime,
              faculty: "Faculty not listed",
              program: "General",
            });
            if (exam) exams.set(exam.id, exam);
          }
        }
      } else if (block.type === "table" && block.rows) {
        const rows = block.rows;
        // Check if table has a header row
        const header = findHeaderRow(rows, !activeDate);

        if (header && header.columns.courseCode !== undefined) {
          for (const row of rows.slice(header.index + 1)) {
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
          // Table without standard headers: scan each row dynamically
          for (const row of rows) {
            const fullRowText = row.join(" ");
            const detectedDate = extractDateFromText(fullRowText);
            if (detectedDate) activeDate = detectedDate.raw;

            const detectedTime = extractTimeFromText(fullRowText);
            if (detectedTime) activeTime = detectedTime.raw;

            const codes = extractCourseCodes(fullRowText);
            if (codes.length > 0 && (detectedDate || activeDate) && (detectedTime || activeTime)) {
              const examDate = detectedDate ? detectedDate.raw : activeDate;
              const examTime = detectedTime ? detectedTime.raw : activeTime;

              for (const c of codes) {
                // Find course title: look for adjacent cell or clean text
                let title = "";
                const codeCellIndex = row.findIndex(
                  (cell) => cell.includes(c.raw) || cell.includes(c.code),
                );
                if (codeCellIndex >= 0 && codeCellIndex + 1 < row.length) {
                  const candidateTitle = row[codeCellIndex + 1].trim();
                  if (
                    candidateTitle.length > 2 &&
                    !extractDateFromText(candidateTitle) &&
                    !extractTimeFromText(candidateTitle)
                  ) {
                    title = candidateTitle;
                  }
                }
                if (!title) {
                  title = extractCleanTitle(fullRowText, c.raw, detectedDate?.raw, detectedTime?.raw);
                }

                const exam = normalizeRow({
                  courseCode: c.code,
                  courseTitle: title,
                  date: examDate,
                  time: examTime,
                  faculty: "Faculty not listed",
                  program: "General",
                });
                if (exam) exams.set(exam.id, exam);
              }
            }
          }
        }
      }
    }
  }

  // Fallback for legacy .doc or plain text
  if (!exams.size && plainTextFallback) {
    const lines = plainTextFallback
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const detectedDate = extractDateFromText(line);
      if (detectedDate) activeDate = detectedDate.raw;

      const detectedTime = extractTimeFromText(line);
      if (detectedTime) activeTime = detectedTime.raw;

      const codes = extractCourseCodes(line);
      if (codes.length > 0 && (detectedDate || activeDate) && (detectedTime || activeTime)) {
        const examDate = detectedDate ? detectedDate.raw : activeDate;
        const examTime = detectedTime ? detectedTime.raw : activeTime;

        for (const c of codes) {
          const title = extractCleanTitle(line, c.raw, detectedDate?.raw, detectedTime?.raw);
          const exam = normalizeRow({
            courseCode: c.code,
            courseTitle: title,
            date: examDate,
            time: examTime,
            faculty: "Faculty not listed",
            program: "General",
          });
          if (exam) exams.set(exam.id, exam);
        }
      }
    }
  }

  return [...exams.values()];
}
