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
  | "section"
  | "room";

export type HeaderColumns = Partial<Record<HeaderField, number>>;

export const HEADER_ALIASES: Record<HeaderField, string[]> = {
  courseCode: [
    "course code",
    "coursecode",
    "course no",
    "course no.",
    "course number",
    "course num",
    "subject code",
    "sub code",
    "code",
    "course",
    "course id",
    "paper code",
    "course code title",
    "course code and title",
    "course code name",
    "course title code",
    "course title and code",
    "course and title",
    "paper",
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
    "paper name",
    "paper title",
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
    "exam date day",
    "exam date and day",
    "day",
    "day & date",
    "date time",
    "date & time",
    "date and time",
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
    "timings",
    "slot time",
    "exam slot",
    "exam timing",
    "hours",
    "schedule",
    "period",
    "date time",
    "date & time",
    "date and time",
  ],
  startTime: [
    "start",
    "starting",
    "start time",
    "starting time",
    "startingtime",
    "from",
    "from time",
    "exam start",
    "start time slot",
    "start slot",
  ],
  endTime: [
    "end",
    "ending",
    "endin",
    "endin g time",
    "end time",
    "ending time",
    "endingtime",
    "to",
    "to time",
    "until",
    "finish",
    "finish time",
    "exam end",
    "ending time slot",
    "end time slot",
    "end slot",
  ],
  faculty: [
    "faculty",
    "faculty name",
    "faculty initial",
    "faculty initials",
    "faculty member",
    "teacher",
    "teacher name",
    "teacher initial",
    "teacher s initial",
    "teachers initial",
    "instructor",
    "instructor name",
    "course teacher",
    "course instructor",
    "lecturer",
    "initial",
    "initials",
    "invigilator",
    "invigilator name",
  ],
  section: [
    "section",
    "sec",
    "sec.",
    "section no",
    "section no.",
    "sec no",
    "sec no.",
    "section number",
  ],
  program: [
    "program",
    "programme",
    "department",
    "dept",
    "dept.",
    "semester",
    "batch",
    "degree",
  ],
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
  const h = normalizeHeader(String(value ?? ""));
  if (!h) return undefined;

  // 1. Exact alias match
  const exact = (Object.entries(HEADER_ALIASES) as [HeaderField, string[]][]).find(([, aliases]) =>
    aliases.includes(h),
  )?.[0];
  if (exact) return exact;

  // 2. Start Time (check before generic time)
  if (
    h.startsWith("start") ||
    h.startsWith("from") ||
    h.includes("start time") ||
    h.includes("starting time") ||
    h === "from"
  ) {
    return "startTime";
  }

  // 3. End Time (check before generic time)
  if (
    h.startsWith("end") ||
    h.startsWith("finish") ||
    h === "to" ||
    h === "to time" ||
    h.includes("end time") ||
    h.includes("ending time") ||
    h.includes("endin")
  ) {
    return "endTime";
  }

  // 4. Course Code
  if (
    h === "course code" ||
    h === "coursecode" ||
    h === "code" ||
    h.includes("course code") ||
    h.includes("course no") ||
    h.includes("course num") ||
    h.includes("subject code") ||
    h.includes("paper code") ||
    (h.startsWith("course") && !h.includes("title") && !h.includes("name"))
  ) {
    return "courseCode";
  }

  // 5. Course Title
  if (
    h === "course title" ||
    h === "coursetitle" ||
    h === "title" ||
    h === "subject" ||
    h.includes("course title") ||
    h.includes("course name") ||
    h.includes("subject title") ||
    h.includes("subject name") ||
    h === "name of course"
  ) {
    return "courseTitle";
  }

  // 6. Date
  if (h.includes("date") || h === "day" || h.startsWith("day")) {
    return "date";
  }

  // 7. Generic Time (if not start/end)
  if (
    h.includes("time") ||
    h.includes("slot") ||
    h.includes("timing") ||
    h.includes("session") ||
    h.includes("schedule") ||
    h.includes("period")
  ) {
    return "time";
  }

  // 8. Faculty
  if (
    h.includes("teacher") ||
    h.includes("faculty") ||
    h.includes("instructor") ||
    h.includes("invigilator") ||
    h.includes("initial")
  ) {
    return "faculty";
  }

  // 8.5 Section (check before program)
  if (
    h === "section" ||
    h === "sec" ||
    h === "sec." ||
    h === "sec no" ||
    h === "section no" ||
    h.startsWith("section") ||
    h.startsWith("sec ")
  ) {
    return "section";
  }

  // 9. Program
  if (
    h.includes("dept") ||
    h.includes("program") ||
    h.includes("batch") ||
    h.includes("semester")
  ) {
    return "program";
  }

  // 10. Room
  if (h.includes("room") || h.includes("hall") || h.includes("venue") || h.includes("lab")) {
    return "room";
  }

  return undefined;
}

export function findHeaderRow(
  rows: unknown[][],
  requireDate = true,
): { index: number; columns: HeaderColumns; headerRowCount?: number } | undefined {
  let best: { index: number; columns: HeaderColumns; score: number; headerRowCount?: number } | undefined;
  const scanLimit = Math.min(rows.length, 60);

  for (let index = 0; index < scanLimit; index += 1) {
    // Strategy A: Single row header
    const columns: HeaderColumns = {};
    rows[index]?.forEach((value, columnIndex) => {
      const field = getHeaderField(value);
      if (field && columns[field] === undefined) columns[field] = columnIndex;
    });

    // Strategy B: 2-row multi-line header (e.g. Row 0: "Starting", Row 1: "Time")
    const nextRow = rows[index + 1];
    const mergedColumns: HeaderColumns = { ...columns };
    if (nextRow && Array.isArray(nextRow)) {
      const maxCols = Math.max(rows[index]?.length ?? 0, nextRow.length);
      for (let c = 0; c < maxCols; c++) {
        const topVal = String(rows[index]?.[c] ?? "").trim();
        const botVal = String(nextRow[c] ?? "").trim();
        const mergedText = `${topVal} ${botVal}`.trim();
        const field = getHeaderField(mergedText);
        if (field && mergedColumns[field] === undefined) {
          mergedColumns[field] = c;
        }
      }
    }

    // Evaluate single row
    if (columns.courseCode !== undefined) {
      const hasTime =
        columns.time !== undefined ||
        columns.startTime !== undefined ||
        columns.endTime !== undefined;
      if (!requireDate || columns.date !== undefined || hasTime) {
        const score = Object.keys(columns).length;
        if (!best || score > best.score) best = { index, columns, score, headerRowCount: 1 };
      }
    }

    // Evaluate 2-row merged
    if (mergedColumns.courseCode !== undefined) {
      const hasTime =
        mergedColumns.time !== undefined ||
        mergedColumns.startTime !== undefined ||
        mergedColumns.endTime !== undefined;
      if (!requireDate || mergedColumns.date !== undefined || hasTime) {
        const score = Object.keys(mergedColumns).length;
        if (!best || score > best.score) {
          best = { index, columns: mergedColumns, score, headerRowCount: 2 };
        }
      }
    }
  }

  return best;
}

function normalizeText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return String(value).trim() || fallback;
}

export function normalizeRow(raw: Record<string, unknown>): ParsedExam | null {
  const rawCodeText = normalizeText(
    raw.courseCode ?? raw["Course Code"] ?? raw["Course code"],
    "",
  );
  if (!rawCodeText) return null;

  // Extract pure course code (e.g. "CSE 101 - Programming" -> "CSE101" or "CSE 181.5" -> "CSE181.5")
  const extractedCodes = extractCourseCodes(rawCodeText);
  let courseCode = extractedCodes.length > 0 ? extractedCodes[0].code : normalizeCourseCode(rawCodeText);
  if (!courseCode) return null;

  // If the extracted code does not have a section dot (.5), check if section is present in raw.section, raw.program, or rawCodeText
  if (!/\.\d+$/.test(courseCode)) {
    const rawSection = normalizeText(
      raw.section ?? raw["Section"] ?? raw["Sec"] ?? raw["Sec."] ?? raw.program,
      "",
    );
    const secMatch = rawSection.match(/^(?:sec(?:tion)?[:\s.-]*)?(\d{1,3})$/i);
    if (secMatch) {
      courseCode = `${courseCode}.${Number(secMatch[1])}`;
    } else {
      const inlineSec = rawCodeText.match(/\bsec(?:tion)?\.?\s*(\d{1,3})\b/i);
      if (inlineSec) {
        courseCode = `${courseCode}.${Number(inlineSec[1])}`;
      }
    }
  }

  let courseTitle = normalizeText(
    raw.courseTitle ?? raw["Course Title"] ?? raw["Course title"] ?? raw["Title"],
    "",
  );
  if (!courseTitle || courseTitle === "Exam" || courseTitle === rawCodeText) {
    if (extractedCodes.length > 0) {
      const cleaned = extractCleanTitle(rawCodeText, extractedCodes[0].raw);
      if (cleaned && cleaned !== "Exam") courseTitle = cleaned;
    }
  }
  if (!courseTitle) {
    courseTitle = "Untitled exam";
  }

  const rawFaculty = normalizeText(
    raw.faculty ?? raw["Faculty"] ?? raw["Teacher"] ?? raw["Instructor"] ?? raw["Lecturer"],
    "",
  );
  const faculty = rawFaculty.trim();
  const program = normalizeText(
    raw.program ?? raw["Program"] ?? raw["Department"] ?? raw["Semester"],
    "General",
  );

  const rawDate = normalizeText(
    raw.date ?? raw["Date"] ?? raw["Exam Date"] ?? raw["Exam date"],
    "",
  );
  const rawTime = normalizeText(
    raw.time ?? raw["Time"] ?? raw["Exam Time"],
    "",
  );
  const rawStartTime = normalizeText(
    raw.startTime ?? raw["Start Time"] ?? raw["Starting Time"] ?? raw["Start"],
    "",
  );
  const rawEndTime = normalizeText(
    raw.endTime ?? raw["End Time"] ?? raw["Ending Time"] ?? raw["End"],
    "",
  );
  const isoDate = toIsoDate(rawDate);

  const timeRange = parseTimeRange(
    rawTime,
    rawStartTime,
    rawEndTime,
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
  const cleanStart = String(startValue ?? "").trim();
  const cleanEnd = String(endValue ?? "").trim();

  // If startValue and endValue are both explicitly passed
  if (cleanStart && cleanEnd) {
    let start = normalizeTime(cleanStart);
    let end = normalizeTime(cleanEnd);

    if (start && end) {
      const startMins = parseTimeToMinutes(start);
      const endMins = parseTimeToMinutes(end);
      if (endMins <= startMins && endMins + 720 > startMins) {
        // End time wrapped into PM without PM label (e.g. start 11:30 AM, end 01:30 PM)
        end = normalizeTime(cleanEnd, "PM");
      }
      return { start, end };
    }
  }

  // If only startValue is passed without endValue
  if (cleanStart && !cleanEnd && !rawValue) {
    const start = normalizeTime(cleanStart);
    if (start) {
      return { start, end: addHoursToTimeString(start, 2) };
    }
  }

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

  const single = normalizeTime(cleaned);
  if (single) {
    return { start: single, end: addHoursToTimeString(single, 2) };
  }

  return { start: "", end: "" };
}

function addHoursToTimeString(timeStr: string, hoursToAdd = 2): string {
  const [hStr, mStr] = timeStr.split(":");
  let h = Number(hStr ?? 0) + hoursToAdd;
  const m = Number(mStr ?? 0);
  if (h >= 24) h = 23;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizeTime(value: string, fallbackPeriod = ""): string {
  let trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  trimmed = trimmed.replace(/^(\d{1,2})\.(\d{2})/, "$1:$2");
  if (/noon/i.test(trimmed)) {
    return "12:00";
  }

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
    /\b(?:\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}|\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})\b/,
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
      `\\b(?:\\d{1,2}\\s*[-/\\s]+\\s*${monthPattern}\\s*[-/\\s,]+\\s*\\d{2,4}|${monthPattern}\\s*[-/\\s]+\\s*\\d{1,2}\\s*[-/\\s,]+\\s*\\d{2,4})\\b`,
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
  const cleaned = text.replace(/noon/gi, "12:00 PM");

  // 1. Range with separator: 10:00 AM - 12:00 PM or 10.00 AM - 12.00 PM
  const matchRange = cleaned.match(
    /(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM)?)/i,
  );
  if (matchRange) {
    const range = parseTimeRange(matchRange[0]);
    if (range.start && range.end) {
      return { raw: matchRange[0], start: range.start, end: range.end };
    }
  }

  // 2. Two times without explicit dash: "10:00 AM 12:00 PM"
  const twoTimes = cleaned.match(
    /(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM))\s+(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM))/i,
  );
  if (twoTimes) {
    const start = normalizeTime(twoTimes[1]);
    const end = normalizeTime(twoTimes[2]);
    if (start && end) return { raw: twoTimes[0], start, end };
  }

  // 3. Single time: "10:00 AM" or "10.00 AM" or "02:30 PM"
  const singleTime = cleaned.match(/(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM))/i);
  if (singleTime) {
    const start = normalizeTime(singleTime[1]);
    if (start) {
      const end = addHoursToTimeString(start, 2);
      return { raw: singleTime[0], start, end };
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
    const cleanNum = m[2].replace(/[\s-]+/g, "").toUpperCase();
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
