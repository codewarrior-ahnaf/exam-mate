import * as mammoth from "mammoth";
import type { ParsedExam } from "@/lib/parsers/normalize";
import { normalizeRow } from "@/lib/parsers/normalize";

export async function parseDocxFile(file: File): Promise<ParsedExam[]> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const lines = result.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: ParsedExam[] = [];

  for (const line of lines) {
    const match = line.match(/((?:\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}|[A-Za-z]{3,}\s+\d{1,2},?\s+\d{4}))\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*(?:-|–|to)\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)\s+([A-Z0-9-]+)\s+(.*)/i);
    if (!match) continue;
    const [, rawDate, rawTime, courseCode, courseTitle] = match;
    const exam = normalizeRow({
      courseCode,
      courseTitle,
      date: rawDate,
      time: rawTime,
      faculty: "Faculty not listed",
      program: "General",
    });
    if (exam) parsed.push(exam);
  }

  return parsed;
}
