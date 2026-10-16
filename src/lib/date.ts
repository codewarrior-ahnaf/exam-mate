export function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatTime(value: string): string {
  if (!value) return "";
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText ?? 0);
  const minutes = Number(minutesText ?? 0);
  const safeHours = Number.isFinite(hours) ? hours : 0;
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  const time = safeHours * 60 + safeMinutes;
  const suffix = time >= 12 * 60 ? "PM" : "AM";
  const twelveHour = ((safeHours + 11) % 12) + 1;
  return `${twelveHour}:${String(safeMinutes).padStart(2, "0")} ${suffix}`;
}

export function normalizeCourseCode(value: string): string {
  return (value ?? "")
    .toString()
    .trim()
    .replace(/[-\s]+/g, "")
    .toUpperCase();
}

export function hasIncompleteTrailingDot(value: string): boolean {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.endsWith(".") || (trimmed.includes(".") && !/\.\d+/.test(trimmed));
}

export function isFullCourseCode(value: string): boolean {
  if (!value) return false;
  const trimmed = value.toString().trim();
  if (hasIncompleteTrailingDot(trimmed)) return false;
  const norm = normalizeCourseCode(trimmed);
  // Must match full format with section (e.g. CSE181.5, MAT101.1):
  // - at least 2 department letters
  // - at least 2 course digits
  // - optional lab suffix letter (e.g. L)
  // - dot and section number digits
  return /^[A-Z]{2,}\d{2,}[A-Z]?\.\d+$/.test(norm);
}

export function coursesMatch(query: string, routineCode: string): boolean {
  const qNorm = normalizeCourseCode(query);
  const rNorm = normalizeCourseCode(routineCode);
  if (!qNorm || !rNorm) return false;
  if (qNorm === rNorm) return true;

  // Check section suffixes (.1, .5, .12, etc.)
  const qSectionMatch = qNorm.match(/\.(\d+)$/);
  const rSectionMatch = rNorm.match(/\.(\d+)$/);

  // Compare base course codes (strip section suffix like .5 or .6)
  const qBase = qNorm.replace(/\.\d+$/, "");
  const rBase = rNorm.replace(/\.\d+$/, "");

  // Compare alphanumeric bases
  const qClean = qBase.replace(/[^A-Z0-9]/g, "");
  const rClean = rBase.replace(/[^A-Z0-9]/g, "");
  if (!qClean || !rClean || qClean !== rClean) return false;

  // Base codes match (e.g. CSE181 == CSE181).
  // If BOTH query and routine specify a section:
  if (qSectionMatch && rSectionMatch) {
    // Exact match of section number required (e.g. .5 vs .5)
    return Number(qSectionMatch[1]) === Number(rSectionMatch[1]);
  }

  // If query specified a section (e.g. CSE181.5) but routine has no section (CSE181):
  // The routine lists the common exam for that course, so allow match.
  if (qSectionMatch && !rSectionMatch) {
    return true;
  }

  // If query did not specify a section (e.g. CSE181), but routine has sections (CSE181.1, CSE181.5):
  // Query without section covers the course.
  if (!qSectionMatch && rSectionMatch) {
    return true;
  }

  return true;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function toIsoDate(value: string): string {
  if (!value) return "";
  let clean = String(value).trim();
  // Strip "Date:" prefix if any
  clean = clean.replace(/^(?:Date|Exam Date|Day)\s*[:=-]\s*/i, "");
  // Strip parentheses like (Sunday), (Tue), (Day)
  clean = clean.replace(/\([^)]*\)/g, " ").trim();
  // Strip day of week names
  clean = clean.replace(/\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b[,.\s]*/gi, "");
  // Strip ordinal suffixes: 1st, 2nd, 3rd, 4th, 20th
  clean = clean.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, "$1");
  clean = clean.replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
  clean = clean.replace(/\s*([/.-])\s*/g, "$1");

  // Pattern 1: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const yFirst = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (yFirst) {
    const res = buildIsoDate(Number(yFirst[1]), Number(yFirst[2]), Number(yFirst[3]));
    if (res) return res;
  }

  // Pattern 2: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY (also 2-digit year)
  const dFirst = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dFirst) {
    const first = Number(dFirst[1]);
    const second = Number(dFirst[2]);
    const yr = Number(dFirst[3]);
    const year = yr < 100 ? 2000 + yr : yr;
    const monthFirst = first > 12 && second <= 12 ? false : second > 12 && first <= 12;
    const day = monthFirst ? second : first;
    const month = monthFirst ? first : second;
    const res = buildIsoDate(year, month, day);
    if (res) return res;
  }

  // Pattern 3: 20-Oct-2024 or 20 October 2024 or 20 Oct 2024
  const dMonthYr = clean.match(/^(\d{1,2})[-/\s]+([A-Za-z]{3,})[-/\s]+(\d{2,4})$/);
  if (dMonthYr) {
    const day = Number(dMonthYr[1]);
    const mStr = dMonthYr[2].toLowerCase().slice(0, 3);
    const month = MONTH_NAMES[mStr];
    const yr = Number(dMonthYr[3]);
    const year = yr < 100 ? 2000 + yr : yr;
    if (month) {
      const res = buildIsoDate(year, month, day);
      if (res) return res;
    }
  }

  // Pattern 4: October 20 2024 or Oct 20 2024
  const monthDYr = clean.match(/^([A-Za-z]{3,})[-/\s]+(\d{1,2})[-/\s]+(\d{2,4})$/);
  if (monthDYr) {
    const mStr = monthDYr[1].toLowerCase().slice(0, 3);
    const month = MONTH_NAMES[mStr];
    const day = Number(monthDYr[2]);
    const yr = Number(monthDYr[3]);
    const year = yr < 100 ? 2000 + yr : yr;
    if (month) {
      const res = buildIsoDate(year, month, day);
      if (res) return res;
    }
  }

  // Pattern 5: Embedded date inside dirty text: e.g. "Exam 20-10-2024 Slot"
  const embedded = clean.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (embedded) {
    const first = Number(embedded[1]);
    const second = Number(embedded[2]);
    const yr = Number(embedded[3]);
    const year = yr < 100 ? 2000 + yr : yr;
    const monthFirst = first > 12 && second <= 12 ? false : second > 12 && first <= 12;
    const day = monthFirst ? second : first;
    const month = monthFirst ? first : second;
    const res = buildIsoDate(year, month, day);
    if (res) return res;
  }

  // Fallback to Date parser
  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    return buildIsoDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  }

  return clean;
}

function buildIsoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function parseTimeToMinutes(value: string): number {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed) return 0;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const period = (match[3] ?? "").toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  const fallback = Number(trimmed.replace(/[^\d]/g, ""));
  return Number.isFinite(fallback) ? fallback : 0;
}
