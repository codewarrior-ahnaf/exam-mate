import * as mammoth from "mammoth";
import type { ParsedExam } from "@/lib/parsers/normalize";
import { normalizeRow } from "@/lib/parsers/normalize";

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

export async function parseDocxFile(file: File): Promise<ParsedExam[]> {
  const arrayBuffer = await file.arrayBuffer();
  let text = "";

  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    text = result.value;
  } catch {
    // Fallback for legacy .doc binary files: extract printable text stream
    text = extractPlainText(arrayBuffer);
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: ParsedExam[] = [];
  const seenIds = new Set<string>();

  for (const line of lines) {
    const match = line.match(
      /((?:\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}|[A-Za-z]{3,}\s+\d{1,2},?\s+\d{4}))\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*(?:-|–|to)\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)\s+([A-Z0-9-]+)\s+(.*)/i
    );
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
    if (exam && !seenIds.has(exam.id)) {
      seenIds.add(exam.id);
      parsed.push(exam);
    }
  }

  return parsed;
}
