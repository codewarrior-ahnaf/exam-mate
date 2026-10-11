import { normalizeCourseCode, toIsoDate, parseTimeToMinutes } from "@/lib/date";

export type ParsedExam = {
  id: string;
  courseCode: string;
  courseTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  faculty: string;
  program: string;
};

function normalizeText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return String(value).trim() || fallback;
}

export function normalizeHeader(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRow(raw: Record<string, unknown>): ParsedExam | null {
  const courseCode = normalizeCourseCode(normalizeText(raw.courseCode ?? raw["Course Code"] ?? raw["Course code"], ""));
  const courseTitle = normalizeText(raw.courseTitle ?? raw["Course Title"] ?? raw["Course title"] ?? raw["Title"], "Untitled exam");
  const faculty = normalizeText(raw.faculty ?? raw["Faculty"] ?? raw["Teacher"] ?? raw["Instructor"] ?? raw["Lecturer"], "Faculty not listed");
  const program = normalizeText(raw.program ?? raw["Program"] ?? raw["Department"] ?? raw["Semester"], "General");

  if (!courseCode) return null;

  const rawDate = normalizeText(raw.date ?? raw["Date"] ?? raw["Exam Date"] ?? raw["Exam date"], "");
  const rawTime = normalizeText(raw.time ?? raw["Time"] ?? raw["Exam Time"] ?? raw["Start Time"] ?? raw["End Time"], "");
  const isoDate = toIsoDate(rawDate);

  const timeRange = parseTimeRange(rawTime, String(raw.startTime ?? raw["Start Time"] ?? ""), String(raw.endTime ?? raw["End Time"] ?? ""));
  const startTime = timeRange.start;
  const endTime = timeRange.end;

  if (!isoDate || !startTime || !endTime) return null;

  return {
    id: `${normalizeCourseCode(courseCode)}-${isoDate}-${startTime}`,
    courseCode,
    courseTitle,
    date: isoDate,
    startTime,
    endTime,
    faculty,
    program,
  };
}

export function parseTimeRange(rawValue: string, startValue = "", endValue = "") {
  const combined = [rawValue, startValue, endValue].filter(Boolean).join(" ");
  const cleaned = combined.replace(/\s+/g, " ").trim();
  if (!cleaned) return { start: "", end: "" };

  const match = cleaned.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s*(?:AM|PM))\s*(?:-|–|to)\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s*(?:AM|PM))/i);

  if (match) {
    const start = normalizeTime(match[1]);
    const end = normalizeTime(match[2]);
    return { start, end };
  }

  const timeTokens = cleaned.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s*(?:AM|PM))/gi) ?? [];
  if (timeTokens.length >= 2) {
    const [startToken, endToken] = timeTokens;
    if (startToken && endToken) {
      return { start: normalizeTime(startToken), end: normalizeTime(endToken) };
    }
  }

  if (startValue || endValue) {
    const start = normalizeTime(startValue || cleaned);
    const end = normalizeTime(endValue || cleaned);
    if (start && end && parseTimeToMinutes(end) > parseTimeToMinutes(start)) {
      return { start, end };
    }
  }

  return { start: normalizeTime(cleaned), end: normalizeTime(cleaned) };
}

function normalizeTime(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  const match = trimmedValue.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? 0);
    const suffix = (match[3] ?? "").toUpperCase();
    if (suffix === "PM" && hours < 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const serialized = trimmedValue.replace(/\s+(AM|PM)/i, "");
  const pieces = serialized.split(":");
  if (pieces.length === 2) {
    const hours = Number(pieces[0]);
    const minutes = Number(pieces[1]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  return trimmedValue;
}
