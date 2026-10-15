import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isTrustedMutationRequest, getClientIp, checkRateLimit } from "@/lib/api-security";

const MAX_REQUEST_BYTES = 512 * 1024;

type Exam = {
  id: string;
  courseCode: string;
  courseTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  faculty?: string;
  program?: string;
};

function eventId(id: string) {
  // Google Calendar event IDs may only contain base32hex characters (a-v, 0-9).
  // Keep the prefix within that alphabet; "exam" contains an invalid "x".
  return `e${createHash("sha256").update(id).digest("hex")}`;
}

function computeExamReminders(examDate: string, startTime: string): { method: string; minutes: number }[] {
  const eventStartMs = new Date(`${examDate}T${startTime}:00+06:00`).getTime();
  const now = Date.now();

  const [y, m, d] = examDate.split("-").map(Number);
  const dayBefore = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const prevYear = dayBefore.getUTCFullYear();
  const prevMonth = String(dayBefore.getUTCMonth() + 1).padStart(2, "0");
  const prevDay = String(dayBefore.getUTCDate()).padStart(2, "0");
  const prevDateStr = `${prevYear}-${prevMonth}-${prevDay}`;

  // 1. Morning reminder: 9:00 AM on the day before the exam
  const morningMs = new Date(`${prevDateStr}T09:00:00+06:00`).getTime();
  // 2. Night reminder: 8:00 PM (20:00) on the day before the exam
  const nightMs = new Date(`${prevDateStr}T20:00:00+06:00`).getTime();

  const overrides: { method: string; minutes: number }[] = [];

  // If 9:00 AM on the day before is still in the future:
  if (morningMs > now) {
    const morningMinutes = Math.round((eventStartMs - morningMs) / (60 * 1000));
    if (morningMinutes > 0 && morningMinutes <= 40320) {
      overrides.push({ method: "popup", minutes: morningMinutes });
    }
  }

  // If 8:00 PM on the day before is still in the future:
  if (nightMs > now) {
    const nightMinutes = Math.round((eventStartMs - nightMs) / (60 * 1000));
    if (nightMinutes > 0 && nightMinutes <= 40320) {
      overrides.push({ method: "popup", minutes: nightMinutes });
    }
  }

  // Fallback: If both previous-day reminders have already passed, but the exam is still upcoming:
  if (overrides.length === 0 && eventStartMs > now) {
    const minutesLeft = Math.round((eventStartMs - now) / (60 * 1000));
    if (minutesLeft >= 60) {
      overrides.push({ method: "popup", minutes: 60 });
    } else if (minutesLeft > 15) {
      overrides.push({ method: "popup", minutes: 15 });
    }
  }

  return overrides;
}

export async function GET() {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) {
      return NextResponse.json({ connected: false, hasCalendarScope: false });
    }
    const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
    const googleAccount = accounts?.find((account) => account.providerId === "google");
    if (!googleAccount) {
      return NextResponse.json({ connected: false, hasCalendarScope: false });
    }
    const token = await auth.api.getAccessToken({
      body: { accountId: googleAccount.id },
      headers: requestHeaders,
    });
    if (!token?.accessToken) {
      return NextResponse.json({ connected: true, hasCalendarScope: false });
    }
    const infoRes = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token.accessToken}`,
      { cache: "no-store" }
    );
    if (infoRes.ok) {
      const data = (await infoRes.json()) as { scope?: string };
      const scopes = data.scope ? data.scope.split(" ") : [];
      const hasCalendarScope = scopes.some((s) => s.includes("calendar.events") || s.includes("calendar"));
      return NextResponse.json({ connected: true, hasCalendarScope });
    }
    return NextResponse.json({ connected: true, hasCalendarScope: false });
  } catch {
    return NextResponse.json({ connected: false, hasCalendarScope: false });
  }
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`calendar_sync:${clientIp}`, 25, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Invalid content type." }, { status: 415 });
  }

  let session;
  let accounts;
  try {
    const requestHeaders = await headers();
    session = await auth.api.getSession({ headers: requestHeaders });
    if (session) accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
  } catch {
    return NextResponse.json(
      { error: "Could not verify Google connection." },
      { status: 503 }
    );
  }
  if (!session) return NextResponse.json({ error: "Connect Google to sync schedule." }, { status: 401 });

  const googleAccount = accounts?.find((account) => account.providerId === "google");
  if (!googleAccount) return NextResponse.json({ error: "Connect Google account first." }, { status: 400 });

  let exams: Exam[];
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_REQUEST_BYTES) throw new Error("Request is too large.");
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BYTES) {
      throw new Error("Request is too large.");
    }
    const body = JSON.parse(bodyText) as { exams?: Exam[] };
    exams = body.exams ?? [];
    if (!Array.isArray(exams) || exams.length > 500 || exams.some((exam) =>
      !exam || typeof exam.id !== "string" || exam.id.length < 1 || exam.id.length > 256 ||
      typeof exam.courseCode !== "string" || exam.courseCode.length < 1 || exam.courseCode.length > 64 ||
      typeof exam.courseTitle !== "string" || exam.courseTitle.length > 300 ||
      (exam.faculty !== undefined && (typeof exam.faculty !== "string" || exam.faculty.length > 300)) ||
      (exam.program !== undefined && (typeof exam.program !== "string" || exam.program.length > 150)) ||
      !isValidIsoDate(exam.date) || !isValidTime(exam.startTime) || !isValidTime(exam.endTime)
    )) throw new Error("Invalid exam list.");
  } catch {
    return NextResponse.json({ error: "Exam schedule is invalid." }, { status: 400 });
  }
  if (!exams.length) return NextResponse.json({ synced: 0 });

  if (
    exams.some(
      (exam) =>
        exam.id?.startsWith("CSE101.1-2026-10-20") ||
        exam.id?.startsWith("CSE181.5-2026-10-31") ||
        exam.id?.startsWith("MAT101.2-2026-10-25")
    )
  ) {
    return NextResponse.json(
      { error: "Sample routines cannot sync to Google Calendar." },
      { status: 400 }
    );
  }

  let token;
  try {
    token = await auth.api.getAccessToken({
      body: { accountId: googleAccount.id },
      headers: await headers(),
    });
  } catch {
    return NextResponse.json(
      { error: "Google session expired. Please reconnect Google from navbar." },
      { status: 401 }
    );
  }

  if (!token?.accessToken) {
    return NextResponse.json(
      { error: "Google session expired. Please reconnect Google from navbar." },
      { status: 401 }
    );
  }

  try {
    let synced = 0;
    for (const exam of exams) {
      const start = `${exam.date}T${exam.startTime}:00+06:00`;
      const end = `${exam.date}T${exam.endTime}:00+06:00`;
      const title = `${exam.courseCode} Exam`;
      const description = [exam.courseTitle, exam.faculty && `Faculty: ${exam.faculty}`, exam.program && `Program: ${exam.program}`].filter(Boolean).join("\n");
      const reminderOverrides = computeExamReminders(exam.date, exam.startTime);
      const event = {
        id: eventId(exam.id),
        summary: title,
        description,
        start: { dateTime: start, timeZone: "Asia/Dhaka" },
        end: { dateTime: end, timeZone: "Asia/Dhaka" },
        reminders: reminderOverrides.length > 0
          ? { useDefault: false, overrides: reminderOverrides }
          : { useDefault: false, overrides: [] },
      };
      const calendarUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
      const requestOptions: RequestInit = {
        headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      };
      let response = await fetch(calendarUrl, { ...requestOptions, method: "POST" });
      if (response.status === 409) {
        response = await fetch(`${calendarUrl}/${event.id}`, { ...requestOptions, method: "PATCH" });
      }
      if (!response.ok) {
        const details = await response.json().catch(() => ({})) as { error?: { message?: string; status?: string } };
        const providerMessage = details.error?.message ?? "";
        if (details.error?.status === "SERVICE_DISABLED" || /has not been used|is disabled/i.test(providerMessage)) {
          return NextResponse.json({
            error: "Google Calendar API disabled for this project.",
          }, { status: 502 });
        }
        if (/insufficient|scope|permission_denied/i.test(providerMessage) || details.error?.status === "PERMISSION_DENIED") {
          return NextResponse.json({
            error: "Calendar permission denied. Please allow Calendar access.",
          }, { status: 403 });
        }
        return NextResponse.json({ error: providerMessage || "Could not save calendar event. Please retry." }, { status: 502 });
      }
      synced += 1;
    }
    return NextResponse.json({ synced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar sync failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day;
}

function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 24) < 24 && (minute ?? 60) < 60;
}
