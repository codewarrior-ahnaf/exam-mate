export function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
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

export function toIsoDate(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  const digitsOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  if (digitsOnly) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return buildIsoDate(year, month, day);
  }

  const patterns = [
    /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/,
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2}$/,
    /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/,
  ];

  if (!patterns.some((pattern) => pattern.test(trimmed))) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return trimmed;
  }

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const fullYear = year < 100 ? 2000 + year : year;
    return buildIsoDate(fullYear, month, day);
  }

  const monthMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (monthMatch) {
    const day = Number(monthMatch[1]);
    const month = new Date(`${monthMatch[2]} 1, 2000`).getMonth();
    const year = Number(monthMatch[3]);
    return buildIsoDate(year, month + 1, day);
  }

  return trimmed;
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
