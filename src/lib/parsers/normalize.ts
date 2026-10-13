import { normalizeCourseCode, toIsoDate, parseTimeToMinutes } from "@/lib/date";

export type ParsedExam = {
  id: string;
  courseCode: string;
  courseTitle: string;
  date: string;
  /** Date text as it appeared in the uploaded routine, for display/export. */
  displayDate?: string;
  startTime: string;
  endTime: string;
  faculty: string;
  program: string;
};

export type HeaderField =
  | "courseCode"
  | "courseTitle"
  | "date"
  | "time"
  | "startTime"
  | "endTime"
  | "faculty"
  | "program"
  | "room";

export type HeaderColumns = Partial<Record<HeaderField, number>>;

export const HEADER_ALIASES: Record<HeaderField, string[]> = {
  courseCode: [
    "course code",
    "coursecode",
    "course no",
    "course no.",
    "course number",
    "subject code",
    "sub code",
    "code",
    "course",
  ],
  courseTitle: [
    "course title",
    "coursetitle",
    "course name",
    "subject title",
    "subject name",
    "title",
    "subject",
    "name of course",
  ],
  date: [
    "date",
    "exam date",
    "examination date",
    "date of exam",
    "date of examination",
    "exam day",
    "day date",
    "date day",
    "date & day",
    "date and day",
  ],
  time: [
    "time",
    "exam time",
    "examination time",
    "exam time slot",
    "time slot",
    "session",
    "slot",
    "timing",
  ],
  startTime: ["start", "start time", "starting time", "from"],
  endTime: ["end", "end time", "ending time", "to", "until"],
  faculty: [
    "faculty",
    "teacher",
    "instructor",
    "lecturer",
    "initial",
    "teacher initial",
    "invigilator",
  ],
  program: ["program", "department", "dept", "dept.", "semester", "batch", "degree"],
  room: ["room", "room no", "room no.", "hall", "room number", "venue", "lab"],
};

export const NON_COURSE_PREFIXES = new Set([
  "ROOM",
  "RM",
  "SEC",
  "SECTION",
  "BATCH",
  "SL",
  "SERIAL",
  "PAGE",
  "TEL",
  "FAX",
  "DATE",
  "TIME",
  "FALL",
  "SPRING",
  "SUMMER",
  "YEAR",
  "SEM",
  "DAY",
  "EVENING",
  "TOTAL",
  "NO",
]);

export function normalizeHeader(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getHeaderField(value: unknown): HeaderField | undefined {
  const header = normalizeHeader(String(value ?? ""));
  return (Object.entries(HEADER_ALIASES) as [HeaderField, string[]][]).find(([, aliases]) =>
    aliases.includes(header),
  )?.[0];
}

export function findHeaderRow(
  rows: unknown[][],
  requireDate = true,
): { index: number; columns: HeaderColumns } | undefined {
  let best: { index: number; columns: HeaderColumns; score: number } | undefined;
  const scanLimit = Math.min(rows.length, 60);

  for (let index = 0; index < scanLimit; index += 1) {
    const columns: HeaderColumns = {};
    rows[index]?.forEach((value, columnIndex) => {
      const field = getHeaderField(value);
      if (field && columns[field] === undefined) columns[field] = columnIndex;
    });

    if (columns.courseCode === undefined) continue;
    const hasTime =
      columns.time !== undefined ||
      columns.startTime !== undefined ||
      columns.endTime !== undefined;

    if (requireDate && (columns.date === undefined || !hasTime)) continue;

    const score = Object.keys(columns).length;
    if (!best || score > best.score) best = { index, columns, score };
  }

  return best;
}

function normalizeText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return String(value).trim() || fallback;
}

export function normalizeRow(raw: Record<string, unknown>): ParsedExam | null {
  const courseCode = normalizeCourseCode(
    normalizeText(raw.courseCode ?? raw["Course Code"] ?? raw["Course code"], ""),
  );
  const courseTitle = normalizeText(
    raw.courseTitle ?? raw["Course Title"] ?? raw["Course title"] ?? raw["Title"],
    "Untitled exam",
  );
  const faculty = normalizeText(
    raw.faculty ?? raw["Faculty"] ?? raw["Teacher"] ?? raw["Instructor"] ?? raw["Lecturer"],
    "Faculty not listed",
  );
  const program = normalizeText(
    raw.program ?? raw["Program"] ?? raw["Department"] ?? raw["Semester"],
    "General",
  );

  if (!courseCode) return null;

  const rawDate = normalizeText(
    raw.date ?? raw["Date"] ?? raw["Exam Date"] ?? raw["Exam date"],
    "",
  );
  const rawTime = normalizeText(
    raw.time ?? raw["Time"] ?? raw["Exam Time"] ?? raw["Start Time"] ?? raw["End Time"],
    "",
  );
  const isoDate = toIsoDate(rawDate);

  const timeRange = parseTimeRange(
    rawTime,
    String(raw.startTime ?? raw["Start Time"] ?? ""),
    String(raw.endTime ?? raw["End Time"] ?? ""),
  );
  const startTime = timeRange.start;
  const endTime = timeRange.end;

  if (!isoDate || !startTime || !endTime) return null;

  return {
    id: `${normalizeCourseCode(courseCode)}-${isoDate}-${startTime}`,
    courseCode,
    courseTitle,
    date: isoDate,
    displayDate: rawDate,
    startTime,
    endTime,
    faculty,
    program,
  };
}

export function parseTimeRange(rawValue: string, startValue = "", endValue = "") {
  const combined = [rawValue, startValue, endValue].filter(Boolean).join(" ");
  const cleaned = combined
    .replace(/(\d{1,2})\.(\d{2})/g, "$1:$2")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { start: "", end: "" };

  const match = cleaned.match(
    /(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i,
  );

  if (match) {
    const rawEnd = match[2];
    const endPeriodMatch = rawEnd.match(/(AM|PM)/i);
    const endPeriod = endPeriodMatch ? endPeriodMatch[1].toUpperCase() : "";

    const rawStart = match[1];
    const startPeriodMatch = rawStart.match(/(AM|PM)/i);
    let startFallback = "";
    if (!startPeriodMatch && endPeriod) {
      const sHour = Number(rawStart.match(/^(\d{1,2})/)?.[1] ?? 0);
      if (endPeriod === "PM" && sHour >= 1 && sHour <= 6) {
        startFallback = "PM";
      } else if (endPeriod === "PM" && sHour >= 7 && sHour <= 11) {
        startFallback = "AM";
      } else {
        startFallback = endPeriod;
      }
    }

    const start = normalizeTime(rawStart, startFallback);
    const end = normalizeTime(rawEnd, endPeriod);
    return { start, end };
  }

  const timeTokens = cleaned.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/gi) ?? [];
  if (timeTokens.length >= 2 && timeTokens[0] && timeTokens[1]) {
    return {
      start: normalizeTime(timeTokens[0]),
      end: normalizeTime(timeTokens[1]),
    };
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

export function normalizeTime(value: string, fallbackPeriod = ""): string {
  let trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  trimmed = trimmed.replace(/^(\d{1,2})\.(\d{2})/, "$1:$2");

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? 0);
    let suffix = (match[3] ?? fallbackPeriod).toUpperCase();

    if (!suffix) {
      if (hours >= 1 && hours <= 6) suffix = "PM";
      else if (hours >= 7 && hours <= 11) suffix = "AM";
      else if (hours === 12) suffix = "PM";
    }

    if (suffix === "PM" && hours < 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const serialized = trimmed.replace(/\s+(AM|PM)/i, "");
  const pieces = serialized.split(":");
  if (pieces.length === 2) {
    const hours = Number(pieces[0]);
    const minutes = Number(pieces[1]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  return trimmed;
}

export function extractDateFromText(text: string): { raw: string; iso: string } | null {
  if (!text) return null;
  // 1. DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD
  const m1 = text.match(
    /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/,
  );
  if (m1) {
    const iso = toIsoDate(m1[0]);
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return { raw: m1[0], iso };
  }
  // 2. 20-Oct-2024, 20 October 2024, October 20, 2024
  const monthPattern =
    "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const m2 = text.match(
    new RegExp(
      `\\b(?:\\d{1,2}[-/\\s]+${monthPattern}[-/\\s,]+\\d{2,4}|${monthPattern}[-/\\s]+\\d{1,2}[-/\\s,]+\\d{2,4})\\b`,
      "i",
    ),
  );
  if (m2) {
    const iso = toIsoDate(m2[0]);
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return { raw: m2[0], iso };
  }
  return null;
}

export function extractTimeFromText(
  text: string,
): { raw: string; start: string; end: string } | null {
  if (!text) return null;
  const match = text.match(
    /(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM)?)/i,
  );
  if (match) {
    const range = parseTimeRange(match[0]);
    if (range.start && range.end) {
      return { raw: match[0], start: range.start, end: range.end };
    }
  }
  return null;
}

export function extractCourseCodes(text: string): { raw: string; code: string }[] {
  if (!text) return [];
  const matches = [
    ...text.matchAll(/\b([A-Za-z]{2,6})\s*[-–.]?\s*(\d{3,4}(?:\.\d+)?[A-Za-z]?)\b/g),
  ];
  const results: { raw: string; code: string }[] = [];
  const seen = new Set<string>();

  for (const m of matches) {
    const prefix = m[1].toUpperCase();
    if (NON_COURSE_PREFIXES.has(prefix)) continue;
    const cleanNum = m[2].replace(/[.\s-]/g, "").toUpperCase();
    const code = `${prefix}${cleanNum}`;
    if (!seen.has(code)) {
      seen.add(code);
      results.push({ raw: m[0], code });
    }
  }
  return results;
}

export function extractCleanTitle(
  rowText: string,
  codeRaw = "",
  dateRaw = "",
  timeRaw = "",
): string {
  let title = rowText;
  if (dateRaw) title = title.replace(dateRaw, " ");
  if (timeRaw) title = title.replace(timeRaw, " ");
  if (codeRaw) title = title.replace(codeRaw, " ");

  // Remove day of week
  title = title.replace(
    /\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/gi,
    " ",
  );
  // Remove serial at start (e.g. "1." or "1 ")
  title = title.replace(/^\s*\d+[.):\s]+/, " ");
  // Remove common routine label words
  title = title.replace(
    /\b(?:Date|Time|Slot|Exam|Examination|Course|Code|Title|Program|Batch|Faculty|Teacher|Room|Dept|Department|Day|Evening)\b:?/gi,
    " ",
  );
  // Remove room indicators
  title = title.replace(/\b(?:Room|Lab|Building|Campus)\s*#?\d+[A-Za-z]?\b/gi, " ");
  // Remove standalone 3-4 digit numbers (room or batch)
  title = title.replace(/\b\d{2,4}\b/g, " ");
  // Remove isolated short uppercase tokens at end (teacher initials)
  title = title.replace(/\b[A-Z]{2,4}\b(?=\s*$)/, " ");
  // Remove program mentions
  title = title.replace(
    /\b(?:B\.?Sc(?:\s+in)?\s+[A-Za-z]+|BBA|MBA|BA|MA|LLB|LLM)\b/gi,
    " ",
  );

  title = title.replace(/[-|–—:;,/]+/g, " ").replace(/\s+/g, " ").trim();
  return title || "Exam";
}
