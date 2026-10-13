import type { ParsedExam } from "@/lib/parsers/normalize";
import { normalizeRow } from "@/lib/parsers/normalize";

interface ExtractedTextItem {
  str: string;
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

export async function parsePdfFile(file: File): Promise<ParsedExam[]> {
  // Dynamically load pdfjs-dist in the browser
  const pdfjsLib = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const parsed: ParsedExam[] = [];
  const seenIds = new Set<string>();

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Filter text items that have strings and transformation matrix
    const items = (textContent.items as unknown[]).filter(isTextItem);

    // Sort items by Y descending (top to bottom), then X ascending (left to right)
    items.sort((a, b) => {
      const yA = a.transform[5] ?? 0;
      const yB = b.transform[5] ?? 0;
      if (Math.abs(yA - yB) > 4) {
        return yB - yA; // top to bottom
      }
      return (a.transform[4] ?? 0) - (b.transform[4] ?? 0); // left to right
    });

    // Group into visual text lines by vertical row coordinates
    const lines: string[] = [];
    let currentY = -9999;
    let currentLine: string[] = [];

    for (const item of items) {
      const text = item.str.trim();
      if (!text) continue;
      const y = item.transform[5] ?? 0;
      if (currentY === -9999 || Math.abs(y - currentY) <= 4.5) {
        currentLine.push(text);
        currentY = y;
      } else {
        if (currentLine.length) lines.push(currentLine.join(" "));
        currentLine = [text];
        currentY = y;
      }
    }
    if (currentLine.length) lines.push(currentLine.join(" "));

    // Parse each line for exam schedules
    for (const line of lines) {
      // Pattern 1: Date, Time Range, Course Code, Title / details
      const match1 = line.match(
        /((?:\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}|[A-Za-z]{3,}\s+\d{1,2},?\s+\d{4}))\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*(?:-|–|to)\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)\s+([A-Z0-9-]+)\s+(.*)/i
      );
      if (match1) {
        const [, rawDate, rawTime, courseCode, rest] = match1;
        const exam = normalizeRow({
          courseCode,
          courseTitle: rest || "Exam",
          date: rawDate,
          time: rawTime,
          faculty: "Faculty not listed",
          program: "General",
        });
        if (exam && !seenIds.has(exam.id)) {
          seenIds.add(exam.id);
          parsed.push(exam);
        }
        continue;
      }

      // Pattern 2: Course Code, Date, Time Range, Title
      const match2 = line.match(
        /([A-Z]{2,4}\s*\d{3,4}[A-Za-z]?)\s+((?:\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}))\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:-|–|to)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*(.*)/i
      );
      if (match2) {
        const [, courseCode, rawDate, rawTime, rest] = match2;
        const exam = normalizeRow({
          courseCode,
          courseTitle: rest || "Exam",
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
    }
  }

  return parsed;
}
