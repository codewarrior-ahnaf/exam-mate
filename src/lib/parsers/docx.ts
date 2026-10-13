import JSZip from "jszip";
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

function cellValue(row: string[], column: number | undefined): string {
  if (column === undefined) return "";
  return (row[column] ?? "").trim();
}

function parseTableXml(tblXml: string): string[][] {
  const trRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/gi;
  const rows: string[][] = [];
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRegex.exec(tblXml)) !== null) {
    const trContent = trMatch[0];
    const tcRegex = /<w:tc[\s>][\s\S]*?<\/w:tc>/gi;
    const row: string[] = [];
    let tcMatch: RegExpExecArray | null;

    while ((tcMatch = tcRegex.exec(trContent)) !== null) {
      const tcContent = tcMatch[0];
      const tMatches = [...tcContent.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/gi)];
      const cellText = tMatches.map((m) => m[1]).join("").trim();
      row.push(cellText);
    }
    if (row.length > 0) rows.push(row);
  }

  return rows;
}

export async function parseDocxFile(file: File): Promise<ParsedExam[]> {
  const arrayBuffer = await file.arrayBuffer();
  const exams = new Map<string, ParsedExam>();
  let activeDate = "";
  let activeTime = "";

  // Attempt 1: Native DOCX extraction via JSZip (unpacking word/document.xml)
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXmlFile = zip.file("word/document.xml");

    if (docXmlFile) {
      const xml = await docXmlFile.async("text");

      // Match body elements (paragraphs and tables) in document order
      const elementRegex = /<w:(p|tbl)[\s>][\s\S]*?<\/w:\1>/gi;
      let elMatch: RegExpExecArray | null;

      while ((elMatch = elementRegex.exec(xml)) !== null) {
        const rawEl = elMatch[0];
        const isTable = rawEl.startsWith("<w:tbl");

        if (!isTable) {
          // Paragraph element
          const tMatches = [...rawEl.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/gi)];
          const pText = tMatches.map((m) => m[1]).join("").trim();
          if (!pText) continue;

          const detectedDate = extractDateFromText(pText);
          if (detectedDate) activeDate = detectedDate.raw;

          const detectedTime = extractTimeFromText(pText);
          if (detectedTime) activeTime = detectedTime.raw;

          const codes = extractCourseCodes(pText);
          if (codes.length > 0 && (detectedDate || activeDate) && (detectedTime || activeTime)) {
            const examDate = detectedDate ? detectedDate.raw : activeDate;
            const examTime = detectedTime ? detectedTime.raw : activeTime;

            for (const c of codes) {
              const title = extractCleanTitle(pText, c.raw, detectedDate?.raw, detectedTime?.raw);
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
        } else {
          // Table element
          const rows = parseTableXml(rawEl);
          if (!rows.length) continue;

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
            // Table without recognized header: scan row cells dynamically
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
  } catch {
    // If JSZip fails (e.g. legacy binary .doc format), continue to plain text stream fallback
  }

  // Attempt 2: Plain text stream fallback for legacy binary .doc or non-zip Word files
  if (!exams.size) {
    const plainText = extractPlainText(arrayBuffer);
    const lines = plainText
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
