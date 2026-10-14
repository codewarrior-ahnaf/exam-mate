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

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`calendar_sync:${clientIp}`, 25, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many calendar sync requests. Please wait a moment before trying again." },
      { status: 429 }
    );
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Send the schedule as JSON." }, { status: 415 });
  }

  let session;
  let accounts;
  try {
    const requestHeaders = await headers();
    session = await auth.api.getSession({ headers: requestHeaders });
    if (session) accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
  } catch {
    return NextResponse.json(
      { error: "The server could not verify your Google connection. Check the auth and database setup, then try again." },
      { status: 503 }
    );
  }
  if (!session) return NextResponse.json({ error: "Connect Google to sync your schedule." }, { status: 401 });

  const googleAccount = accounts?.find((account) => account.providerId === "google");
  if (!googleAccount) return NextResponse.json({ error: "Connect your Google account first." }, { status: 400 });

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
    return NextResponse.json({ error: "The exam schedule is invalid." }, { status: 400 });
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
      { error: "Sample preview routines cannot be synced to Google Calendar." },
      { status: 400 }
    );
  }

  try {
    const token = await auth.api.getAccessToken({
      body: { accountId: googleAccount.id },
      headers: await headers(),
    });
    let synced = 0;
    for (const exam of exams) {
      const start = `${exam.date}T${exam.startTime}:00+06:00`;
      const end = `${exam.date}T${exam.endTime}:00+06:00`;
      const title = `${exam.courseCode} Exam`;
      const description = [exam.courseTitle, exam.faculty && `Faculty: ${exam.faculty}`, exam.program && `Program: ${exam.program}`].filter(Boolean).join("\n");
      const event = {
        id: eventId(exam.id), summary: title, description,
        start: { dateTime: start, timeZone: "Asia/Dhaka" },
        end: { dateTime: end, timeZone: "Asia/Dhaka" },
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 * 24 }] },
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
        const projectId = providerMessage.match(/project\s+(\d+)/i)?.[1];
        if (details.error?.status === "SERVICE_DISABLED" || /has not been used|is disabled/i.test(providerMessage)) {
          const enableUrl = projectId
            ? `https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=${projectId}`
            : "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com";
          return NextResponse.json({
            error: `Google Calendar API is disabled for this project. Enable it here: ${enableUrl}. Wait a few minutes, then sync again.`,
          }, { status: 502 });
        }
        return NextResponse.json({ error: providerMessage || "Google Calendar could not save an event. Please reconnect Google and try again." }, { status: 502 });
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
