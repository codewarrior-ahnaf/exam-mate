"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  LoaderCircle,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { GState, jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { authClient } from "@/lib/auth-client";
import { formatDate, formatTime, normalizeCourseCode, coursesMatch } from "@/lib/date";
import { parseExcelFile } from "@/lib/parsers/excel";
import type { ParsedExam } from "@/lib/parsers/normalize";
import PageLoadingSkeleton from "./loading-skeleton";

const ROUTINE_STORAGE_KEY = "examMate:routine:v1";

// Demo sample exams for instant synthesis test
const SAMPLE_EXAMS: ParsedExam[] = [
  {
    id: "CSE101-2026-10-20-10:00",
    courseCode: "CSE101",
    courseTitle: "Introduction to Computer Systems & C Programming",
    date: "2026-10-20",
    startTime: "10:00",
    endTime: "12:00",
    faculty: "Dr. K. Rahman (Room 402)",
    program: "B.Sc. in CSE",
  },
  {
    id: "CSE102-2026-10-22-14:00",
    courseCode: "CSE102",
    courseTitle: "Discrete Mathematics & Logic Formulation",
    date: "2026-10-22",
    startTime: "14:00",
    endTime: "16:00",
    faculty: "Prof. S. Ahmed (Room 501)",
    program: "B.Sc. in CSE",
  },
  {
    id: "MAT101-2026-10-25-10:00",
    courseCode: "MAT101",
    courseTitle: "Differential & Integral Calculus",
    date: "2026-10-25",
    startTime: "10:00",
    endTime: "12:00",
    faculty: "Dr. F. Hasan (Room 303)",
    program: "Basic Sciences",
  },
  {
    id: "PHY101-2026-10-27-14:00",
    courseCode: "PHY101",
    courseTitle: "Physics: Mechanics & Electromagnetism",
    date: "2026-10-27",
    startTime: "14:00",
    endTime: "16:00",
    faculty: "Dr. N. Chowdhury (Room 205)",
    program: "Basic Sciences",
  },
  {
    id: "ENG101-2026-10-29-10:00",
    courseCode: "ENG101",
    courseTitle: "English Reading & Academic Composition",
    date: "2026-10-29",
    startTime: "10:00",
    endTime: "12:00",
    faculty: "Ms. T. Sultana (Room 602)",
    program: "General Education",
  },
];

async function parseRoutineFile(file: File): Promise<ParsedExam[]> {
  const extension = file.name.toLowerCase();
  if (
    extension.endsWith(".xlsx") ||
    extension.endsWith(".xls") ||
    extension.endsWith(".xlsm") ||
    extension.endsWith(".csv")
  ) {
    return parseExcelFile(file);
  }
  throw new Error("Please upload an Excel spreadsheet file (.xlsx, .xls, .csv).");
}

function sortExams(exams: ParsedExam[]) {
  return [...exams].sort((left, right) => {
    const leftDate = new Date(`${left.date}T${left.startTime}:00`).getTime();
    const rightDate = new Date(`${right.date}T${right.startTime}:00`).getTime();
    return leftDate - rightDate;
  });
}

function getDayName(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
}

function formatExamDate(exam: ParsedExam): string {
  return (exam.displayDate?.trim() || formatDate(exam.date)).replace(/(\d)\.(?=\d)/g, "$1/");
}

function formatFaculty(faculty: string): string {
  if (/^faculty not listed$/i.test(faculty.trim())) return "—";
  const name = faculty
    .replace(/\b(?:room|venue|hall|classroom)\s*(?:no\.?|number)?\s*[\w-]+/gi, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[()[\],]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const titles = new Set(["dr", "prof", "professor", "mr", "mrs", "ms", "miss"]);
  const nameParts = name
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !titles.has(part.replace(/\./g, "").toLowerCase()));
  const displayName = nameParts.join(" ");
  const firstName = nameParts[0]?.replace(/[^A-Za-z]/g, "") ?? "";
  const initials = firstName.length >= 4
    ? firstName.slice(0, 4).toUpperCase()
    : nameParts
        .map((part) => part.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase())
        .join("")
        .slice(0, 4);

  return initials && displayName ? `[${initials}] ${displayName}` : "—";
}

function formatGeneratedDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function isValidStoredRoutine(value: unknown): value is {
  version: number;
  savedAt: string;
  expiresAt: string;
  exams: ParsedExam[];
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === "number" &&
    typeof candidate.savedAt === "string" &&
    typeof candidate.expiresAt === "string" &&
    Array.isArray(candidate.exams)
  );
}

async function startGoogleSignIn() {
  return authClient.signIn.social({
    provider: "google",
    callbackURL: "/",
    errorCallbackURL: "/?auth_error=google_oauth",
    additionalParams: {
      access_type: "offline",
      prompt: "consent",
    },
  });
}

function CustomScrollbar() {
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerY: number; scrollTop: number } | null>(null);
  const [scrollbar, setScrollbar] = useState({
    trackHeight: 0,
    thumbHeight: 0,
    thumbTop: 0,
    scrollTop: 0,
    maxScroll: 0,
  });

  useEffect(() => {
    function syncScrollbar() {
      const trackHeight = Math.max(window.innerHeight - 16, 0);
      const maxScroll = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0
      );
      const thumbHeight = maxScroll
        ? Math.min(trackHeight, Math.max(36, (trackHeight * window.innerHeight) / document.documentElement.scrollHeight))
        : trackHeight;
      const scrollTop = window.scrollY;

      setScrollbar({
        trackHeight,
        thumbHeight,
        thumbTop: maxScroll
          ? (scrollTop / maxScroll) * Math.max(trackHeight - thumbHeight, 0)
          : 0,
        scrollTop,
        maxScroll,
      });
    }

    const resizeObserver = new ResizeObserver(syncScrollbar);
    resizeObserver.observe(document.documentElement);
    window.addEventListener("scroll", syncScrollbar, { passive: true });
    window.addEventListener("resize", syncScrollbar);
    syncScrollbar();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", syncScrollbar);
      window.removeEventListener("resize", syncScrollbar);
    };
  }, []);

  if (scrollbar.maxScroll === 0) return null;

  const scrollToTrackPosition = (clientY: number) => {
    const bounds = thumbRef.current?.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    const travel = Math.max(scrollbar.trackHeight - scrollbar.thumbHeight, 1);
    const thumbOffset = Math.min(
      Math.max(clientY - bounds.top - scrollbar.thumbHeight / 2, 0),
      travel
    );
    window.scrollTo({
      top: (thumbOffset / travel) * scrollbar.maxScroll,
      behavior: "smooth",
    });
  };

  return (
    <div
      className="custom-scrollbar fixed right-0 top-2 z-[60] flex h-[calc(100dvh-1rem)] w-3 justify-center"
      onPointerDown={(event) => {
        if (event.target === thumbRef.current) {
          dragRef.current = {
            pointerY: event.clientY,
            scrollTop: scrollbar.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
          return;
        }
        scrollToTrackPosition(event.clientY);
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        const thumbTravel = Math.max(
          scrollbar.trackHeight - scrollbar.thumbHeight,
          1
        );
        const nextTop = Math.min(
          Math.max(
            dragRef.current.scrollTop +
              ((event.clientY - dragRef.current.pointerY) / thumbTravel) *
                scrollbar.maxScroll,
            0
          ),
          scrollbar.maxScroll
        );
        window.scrollTo(0, nextTop);
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      <div className="custom-scrollbar-track relative h-full w-full">
        <div
          ref={thumbRef}
          role="scrollbar"
          aria-label="Page scroll"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(
            (scrollbar.scrollTop / Math.max(scrollbar.maxScroll, 1)) * 100
          )}
          tabIndex={0}
          className="custom-scrollbar-thumb absolute left-1/2 w-1 -translate-x-1/2 rounded-full bg-teal-200/50 transition-[width,background-color] hover:w-1.5 hover:bg-teal-200/80 focus-visible:w-1.5 focus-visible:bg-teal-200"
          style={{
            height: scrollbar.thumbHeight,
            top: scrollbar.thumbTop,
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") window.scrollBy(0, 40);
            if (event.key === "ArrowUp") window.scrollBy(0, -40);
            if (event.key === "PageDown") window.scrollBy(0, window.innerHeight);
            if (event.key === "PageUp") window.scrollBy(0, -window.innerHeight);
            if (event.key === "Home") window.scrollTo(0, 0);
            if (event.key === "End") window.scrollTo(0, document.documentElement.scrollHeight);
          }}
        />
      </div>
    </div>
  );
}

function LazySection({
  children,
  id,
  className,
  minHeight,
  as: Tag = "section",
}: {
  children: React.ReactNode;
  id?: string;
  className: string;
  minHeight: string;
  as?: "section" | "footer";
}) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (!("IntersectionObserver" in window)) {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "140px 0px" }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      id={id}
      className={className}
      aria-busy={!isNearViewport}
    >
      {isNearViewport ? (
        children
      ) : (
        <div
          ref={sectionRef}
          aria-hidden="true"
          className="min-h-[inherit] w-full animate-pulse rounded-2xl border border-teal-500/15 bg-[#0d1b22]/45 p-5"
          style={{ minHeight }}
        >
          <div className="mb-6 h-4 w-1/3 rounded-full bg-teal-100/10" />
          <div className="mb-3 h-3 w-2/3 rounded-full bg-teal-100/[0.07]" />
          <div className="h-3 w-1/2 rounded-full bg-teal-100/[0.07]" />
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="h-24 rounded-xl border border-teal-100/[0.06] bg-teal-100/[0.035]" />
            <div className="h-24 rounded-xl border border-teal-100/[0.06] bg-teal-100/[0.035]" />
          </div>
        </div>
      )}
    </Tag>
  );
}

export default function Home() {
  const { data: authSession } = authClient.useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [fileName, setFileName] = useState("");
  const [courseInput, setCourseInput] = useState("");
  const [courseDraft, setCourseDraft] = useState("");
  const [allExams, setAllExams] = useState<ParsedExam[]>([]);
  const [generatedExams, setGeneratedExams] = useState<ParsedExam[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [pngExporting, setPngExporting] = useState(false);
  const lastCalendarSyncRef = useRef("");
  const [isDragOver, setIsDragOver] = useState(false);
  const selectedCourseCodes = useMemo(() => {
    return Array.from(
      new Set(
        courseInput
          .split(/[\n,]+/)
          .map((value) => normalizeCourseCode(value))
          .filter(Boolean)
      )
    );
  }, [courseInput]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ROUTINE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidStoredRoutine(parsed)) {
        window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
        return;
      }

      const expiresAt = new Date(parsed.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
        return;
      }

      const validExams = sortExams(parsed.exams);
      if (!validExams.length) {
        window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
        return;
      }

      setGeneratedExams(validExams);
      setSavedNotice(
        `Routine restored · expires on ${formatDate(parsed.expiresAt.slice(0, 10))}`
      );
    } catch {
      window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setPageReady(true), 450);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 7000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!savedNotice) return;
    const timer = window.setTimeout(() => setSavedNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  async function syncCalendar(exams = generatedExams) {
    if (!authSession || !exams.length) return;
    setCalendarSyncing(true);
    try {
      const response = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exams }),
      });
      const responseText = await response.text();
      let result: { synced?: number; error?: string };
      try {
        result = JSON.parse(responseText) as { synced?: number; error?: string };
      } catch {
        throw new Error(
          response.ok
            ? "The server returned an unreadable Calendar response. Please try again."
            : `Calendar sync failed with a server error (${response.status}). Please try again later.`
        );
      }
      if (!response.ok) throw new Error(result.error || "Could not sync Google Calendar.");
      setMessage(`${result.synced ?? exams.length} exam${(result.synced ?? exams.length) === 1 ? "" : "s"} synced to Google Calendar with 24-hour reminders.`);
    } catch (syncError) {
      lastCalendarSyncRef.current = "";
      setError(syncError instanceof Error ? syncError.message : "Could not sync Google Calendar.");
    } finally {
      setCalendarSyncing(false);
    }
  }

  useEffect(() => {
    if (!authSession || !generatedExams.length) return;
    const syncKey = JSON.stringify(generatedExams);
    if (lastCalendarSyncRef.current === syncKey) return;
    lastCalendarSyncRef.current = syncKey;
    void syncCalendar(generatedExams);
  }, [authSession, generatedExams]);

  function persistRoutine(exams: ParsedExam[]) {
    const savedAt = new Date();
    const expiresAt = new Date(savedAt.getTime() + 15 * 24 * 60 * 60 * 1000);
    const payload = {
      version: 1,
      savedAt: savedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      exams: sortExams(exams),
    };

    try {
      window.localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage unavailable in private browsing
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setError("");
    setMessage("");
    setFileName(file.name);

    try {
      const parsed = await parseRoutineFile(file);
      if (!parsed.length) {
        throw new Error(
          "No valid exams found. Verify the file includes Course Code, Date, and Time columns."
        );
      }
      setAllExams(sortExams(parsed));
      setMessage(`Synthesized ${parsed.length} exam entries successfully.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not parse this routine file."
      );
      setAllExams([]);
      setGeneratedExams([]);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    void handleFileUpload(nextFile);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  }

  function addCourseCodes(value: string) {
    const codes = value
      .split(/[\n,]+/)
      .map((code) => normalizeCourseCode(code))
      .filter(Boolean);
    if (codes.length) {
      setCourseInput(
        Array.from(new Set([...selectedCourseCodes, ...codes])).join(", ")
      );
    }
    setCourseDraft(value.split(/[\n,]+/).at(-1)?.trim() ?? "");
  }

  function removeCourseCode(codeToRemove: string) {
    setCourseInput(
      selectedCourseCodes.filter((code) => code !== codeToRemove).join(", ")
    );
  }

  function handleGenerate() {
    if (!allExams.length) {
      setError("Upload an exam routine before generating your table.");
      return;
    }

    if (!selectedCourseCodes.length) {
      setError("Add at least one course code to build your personal exam table.");
      return;
    }

    setGenerating(true);
    setError("");
    setMessage("");

    const matches = sortExams(
      allExams.filter((exam) =>
        selectedCourseCodes.some((code) => coursesMatch(code, exam.courseCode))
      )
    );
    const unmatched = selectedCourseCodes.filter(
      (code) => !allExams.some((exam) => coursesMatch(code, exam.courseCode))
    );

    setGeneratedExams(matches);
    persistRoutine(matches);

    if (!matches.length) {
      setError(`No matches found for: ${unmatched.join(", ")} in routine.`);
      setGenerating(false);
      return;
    }

    setMessage(
      `${matches.length} exam${matches.length > 1 ? "s" : ""} generated! ${
        unmatched.length ? `Unmatched: ${unmatched.join(", ")}.` : ""
      }`
    );
    setGenerating(false);

    // Scroll to results table section
    const resultsElement = document.getElementById("results");
    if (resultsElement) {
      resultsElement.scrollIntoView({ behavior: "smooth" });
    }
  }

  function handleLoadSample() {
    setAllExams(SAMPLE_EXAMS);
    setFileName("Sample_Exam_Routine_Fall2026.xlsx");
    setCourseInput("CSE101, CSE102, MAT101");
    setMessage("Sample routine loaded. Click Generate to build your table.");
  }

  function clearSavedRoutine() {
    lastCalendarSyncRef.current = "";
    setGeneratedExams([]);
    setCourseInput("");
    setCourseDraft("");
    setFileName("");
    setAllExams([]);
    if (inputRef.current) inputRef.current.value = "";
    try {
      window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (authSession) {
      void authClient.signOut();
    }
    setSavedNotice("");
    setMessage("Cleared your local exam routine data.");
  }

  async function handleGoogleConnect() {
    setGoogleLoading(true);
    setError("");
    try {
      const result = await startGoogleSignIn();
      if (result?.error) {
        throw new Error(result.error.message || "Google sign-in could not start.");
      }
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Google sign-in could not start."
      );
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGoogleDisconnect() {
    setGoogleLoading(true);
    setError("");
    try {
      const disconnectResponse = await fetch("/api/calendar/disconnect", { method: "POST" });
      const disconnectText = await disconnectResponse.text();
      let disconnectResult: { disconnected?: boolean; error?: string };
      try {
        disconnectResult = JSON.parse(disconnectText) as { disconnected?: boolean; error?: string };
      } catch {
        throw new Error("Google disconnect failed because the server returned an invalid response.");
      }
      if (!disconnectResponse.ok) {
        throw new Error(disconnectResult.error || "Google disconnect could not be completed.");
      }
      const result = await authClient.signOut();
      if (result?.error) throw new Error(result.error.message || "Google disconnect could not be completed.");
      lastCalendarSyncRef.current = "";
      setMessage("Google disconnected. Exams already synced remain in your Google Calendar.");
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Google disconnect could not be completed.");
    } finally {
      setGoogleLoading(false);
    }
  }

  function buildPdfDocument(): jsPDF {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(15, 45, 42);
    doc.text("Exam Routine", 14, 19);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(92, 111, 108);
    doc.text(`Generated: ${formatGeneratedDate(new Date())}`, 14, 27);
    doc.setDrawColor(94, 234, 212);
    doc.setLineWidth(0.8);
    doc.line(14, 32, pageWidth - 14, 32);

    const rows = generatedExams.map((exam) => [
      formatExamDate(exam),
      getDayName(exam.date),
      `${formatTime(exam.startTime)} – ${formatTime(exam.endTime)}`,
      exam.courseCode,
      exam.courseTitle,
      formatFaculty(exam.faculty),
    ]);

    autoTable(doc, {
      head: [
        [
          "Date",
          "Day",
          "Time",
          "Course",
          "Course Title",
          "Faculty",
        ],
      ],
      body: rows,
      startY: 39,
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 3.5,
        textColor: [38, 52, 50],
        lineColor: [220, 232, 229],
        lineWidth: 0.2,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [14, 116, 104],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 27 },
        1: { cellWidth: 29 },
        2: { cellWidth: 43 },
        3: { cellWidth: 29 },
        4: { cellWidth: 98 },
        5: { cellWidth: 43 },
      },
      margin: { left: 14, right: 14, bottom: 20 },
      alternateRowStyles: { fillColor: [241, 249, 247] },
      didDrawPage: () => {
        doc.setGState(new GState({ opacity: 0.1 }));
        doc.setFont("helvetica", "bold");
        doc.setFontSize(46);
        doc.setTextColor(13, 148, 136);
        doc.text("ExamMate", pageWidth / 2, pageHeight / 2, {
          align: "center",
          angle: 35,
        });
        doc.setGState(new GState({ opacity: 1 }));
        doc.setDrawColor(220, 232, 229);
        doc.setLineWidth(0.3);
        doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(105, 122, 118);
        doc.text("ExamMate", pageWidth - 14, pageHeight - 8, {
          align: "right",
        });
      },
    });

    return doc;
  }

  function exportPdf() {
    if (!generatedExams.length) {
      setError("Synthesize your exam table first before exporting a PDF.");
      return;
    }
    const doc = buildPdfDocument();
    doc.save("ExamMate-Schedule.pdf");
  }

  function fallbackExportPng() {
    const scale = 2;
    const width = 1100;
    const paddingX = 40;
    const headerHeight = 110;
    const rowHeight = 44;
    const footerHeight = 50;
    const tableTop = headerHeight;
    const totalHeight = headerHeight + (generatedExams.length + 1) * rowHeight + footerHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, totalHeight);

    ctx.save();
    ctx.translate(width / 2, totalHeight / 2);
    ctx.rotate(-25 * (Math.PI / 180));
    ctx.font = "bold 90px 'Inter', sans-serif";
    ctx.fillStyle = "rgba(13, 148, 136, 0.07)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ExamMate", 0, 0);
    ctx.restore();

    ctx.font = "bold 26px 'Inter', sans-serif";
    ctx.fillStyle = "#0f2d2a";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Exam Routine", paddingX, 30);

    ctx.font = "13px 'Inter', sans-serif";
    ctx.fillStyle = "#5c6f6c";
    ctx.fillText(`Generated: ${formatGeneratedDate(new Date())}`, paddingX, 66);

    ctx.strokeStyle = "#5eead4";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(paddingX, 90);
    ctx.lineTo(width - paddingX, 90);
    ctx.stroke();

    const tableWidth = width - paddingX * 2;
    const columns = [
      { header: "Date", width: tableWidth * 0.12 },
      { header: "Day", width: tableWidth * 0.12 },
      { header: "Time", width: tableWidth * 0.18 },
      { header: "Course", width: tableWidth * 0.12 },
      { header: "Course Title", width: tableWidth * 0.30 },
      { header: "Faculty", width: tableWidth * 0.16 },
    ];

    ctx.fillStyle = "#0e7468";
    ctx.fillRect(paddingX, tableTop, tableWidth, rowHeight);
    ctx.font = "bold 13px 'Inter', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";

    let colX = paddingX;
    for (const col of columns) {
      ctx.fillText(col.header, colX + 12, tableTop + rowHeight / 2);
      colX += col.width;
    }

    const rows = generatedExams.map((exam) => [
      formatExamDate(exam),
      getDayName(exam.date),
      `${formatTime(exam.startTime)} – ${formatTime(exam.endTime)}`,
      exam.courseCode,
      exam.courseTitle,
      formatFaculty(exam.faculty),
    ]);

    let currentY = tableTop + rowHeight;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const isAlt = r % 2 === 1;

      ctx.fillStyle = isAlt ? "#f1f9f7" : "#ffffff";
      ctx.fillRect(paddingX, currentY, tableWidth, rowHeight);

      ctx.strokeStyle = "#dce8e5";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(paddingX, currentY + rowHeight);
      ctx.lineTo(width - paddingX, currentY + rowHeight);
      ctx.stroke();

      colX = paddingX;
      for (let c = 0; c < columns.length; c++) {
        const val = row[c];
        const colDef = columns[c];

        ctx.font = c === 3 ? "bold 12px 'DM Mono', monospace" : "12px 'Inter', sans-serif";
        ctx.fillStyle = c === 3 ? "#0e7468" : "#263432";

        const maxTextWidth = colDef.width - 24;
        let textToDraw = val;
        if (ctx.measureText(textToDraw).width > maxTextWidth) {
          while (textToDraw.length > 0 && ctx.measureText(textToDraw + "...").width > maxTextWidth) {
            textToDraw = textToDraw.slice(0, -1);
          }
          textToDraw += "...";
        }

        ctx.fillText(textToDraw, colX + 12, currentY + rowHeight / 2);
        colX += colDef.width;
      }

      currentY += rowHeight;
    }

    ctx.strokeStyle = "#0e7468";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(paddingX, tableTop, tableWidth, (rows.length + 1) * rowHeight);

    const footerY = totalHeight - 22;
    ctx.strokeStyle = "#dce8e5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX, totalHeight - 35);
    ctx.lineTo(width - paddingX, totalHeight - 35);
    ctx.stroke();

    ctx.font = "11px 'Inter', sans-serif";
    ctx.fillStyle = "#697a76";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("ExamMate", width - paddingX, footerY);

    const link = document.createElement("a");
    link.download = "ExamMate-Schedule.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function exportPng() {
    if (!generatedExams.length) {
      setError("Synthesize your exam table first before exporting an image.");
      return;
    }

    setPngExporting(true);

    try {
      // 1. Build the exact PDF document
      const doc = buildPdfDocument();
      const pdfBytes = doc.output("arraybuffer");

      // 2. Render that exact PDF to high-resolution PNG using pdfjs-dist
      const pdfjsLib = await import("pdfjs-dist");
      if (typeof window !== "undefined") {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }

      const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
      const pagesData: { page: any; viewport: any }[] = [];
      let totalHeight = 0;
      let maxWidth = 0;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.5 });
        pagesData.push({ page, viewport });
        totalHeight += viewport.height;
        maxWidth = Math.max(maxWidth, viewport.width);
      }

      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context is unavailable.");

      let currentY = 0;
      for (const { page, viewport } of pagesData) {
        ctx.save();
        ctx.translate(0, currentY);
        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
        ctx.restore();
        currentY += viewport.height;
      }

      const link = document.createElement("a");
      link.download = "ExamMate-Schedule.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.warn("Direct PDF to PNG render fallback:", err);
      fallbackExportPng();
    } finally {
      setPngExporting(false);
    }
  }

  const faqItems = [
    {
      question: "Can I use ExamMate without an account?",
      answer:
        "Yes, absolutely. You can upload a routine, enter your course codes, and synthesize a personal examination schedule immediately without creating an account or providing any credentials.",
    },
    {
      question: "Which file types can I upload?",
      answer:
        "Excel spreadsheet files (.xlsx, .xls, and .csv) are fully supported. The parser automatically scans and detects relevant column headers (Course Code, Date, Time, Starting/Ending Time, Room, Faculty) and synthesizes your personalized schedule.",
    },
    {
      question: "What happens to my data?",
      answer:
        "Your routine file is processed in your browser, and your generated schedule is saved on your device for up to 15 days. Google sign-in is optional.",
    },
    {
      question: "Can I sync my schedule to Google Calendar?",
      answer:
        "Yes. Connect Google and generate your schedule to add each exam to your primary Google Calendar with its course code, date, and time. ExamMate sets a Google Calendar popup reminder 24 hours before each exam. Click the connected Google icon in the navbar to sync again after updating your schedule.",
    },
  ];

  if (!pageReady) return <PageLoadingSkeleton />;

  return (
    <div className="min-h-screen text-[#E2E8F0] relative flex flex-col items-center justify-start selection:bg-teal-500/30 selection:text-teal-200">
      {/* Background Ambience Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[8%] right-[12%] w-[38rem] h-[38rem] bg-teal-500/10 rounded-full blur-[140px]" />
        <div className="absolute top-[45%] left-[5%] w-[32rem] h-[32rem] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[20%] w-[40rem] h-[30rem] bg-cyan-500/5 rounded-full blur-[140px]" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[1240px] px-3 pt-3 pb-16 flex flex-col gap-8 sm:px-6 sm:pt-4 sm:pb-20 sm:gap-10 lg:px-8">

        {/* NAVBAR */}
        <header className="order-1 z-20 w-full rounded-2xl glass-panel border border-teal-500/30 px-2.5 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {/* Left: icon.svg logo + ExamMate */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img
              src="/icon.svg"
              alt="ExamMate Logo"
              className="h-6 w-6 shrink-0 sm:h-7 sm:w-7"
            />
            <span className="whitespace-nowrap text-[17px] font-bold tracking-tight text-white sm:text-xl">
              Exam<span className="text-neon-mint">Mate</span>
            </span>
          </div>

          {/* Google connection action follows the dark glass and mint page palette. */}
          <div className="group/google relative mr-0.5 shrink-0 sm:mr-1">
            {!authSession && (
              <Send
                aria-hidden="true"
                className="pointer-events-none absolute -right-1.5 -top-2.5 z-10 h-4 w-4 rotate-[-10deg] fill-[#5EEAD4] text-[#5EEAD4] drop-shadow-[0_0_7px_rgba(94,234,212,0.8)] sm:-right-2 sm:-top-3 sm:h-5 sm:w-5"
              />
            )}
            <button
              type="button"
              onClick={authSession ? handleGoogleDisconnect : handleGoogleConnect}
              disabled={googleLoading || calendarSyncing || (!authSession && generatedExams.length === 0)}
              aria-label={authSession ? "Disconnect Google. Synced events will remain in Google Calendar." : generatedExams.length ? "Connect Google and sync this routine" : "Generate a routine before connecting Google"}
              className={`google-connect-button group ${
                authSession
                  ? "google-connect-button--connected"
                  : generatedExams.length
                    ? "google-connect-button--ready google-connect-button--connect"
                    : "google-connect-button--disabled google-connect-button--connect"
              }`}
            >
              {googleLoading || calendarSyncing ? (
                <LoaderCircle className="h-5 w-5 animate-spin text-teal-300" />
              ) : (
                <img src="/google-logo.png" alt="" aria-hidden="true" className="google-connect-logo shrink-0" />
              )}
              {!authSession && <span className="whitespace-nowrap text-[11px] font-medium tracking-wide sm:text-[13px]">Connect Google</span>}
            </button>
            <span role="tooltip" className="pointer-events-none absolute right-0 top-[calc(100%+1.25rem)] z-50 w-max max-w-[min(18rem,calc(100vw-2rem))] translate-y-1 rounded-lg border border-teal-200/25 bg-[#0b171f]/95 px-3 py-2 text-xs leading-relaxed text-teal-50 opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl transition duration-200 group-hover/google:translate-y-0 group-hover/google:opacity-100 group-focus-within/google:translate-y-0 group-focus-within/google:opacity-100">
              {authSession
                ? "Connected Google. Click to Disconnect"
                : generatedExams.length
                  ? "Connect Google to sync this exam routine and set reminders."
                  : "Generate your exam routine before connecting Google."}
            </span>
          </div>
        </header>

        {/* HERO SECTION */}
        <LazySection className="order-2 relative w-full pt-2 lg:pt-4 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start" minHeight="460px">
          {/* Left Side: Headline, Subheadline, Buttons */}
          <div className="lg:col-span-7 flex flex-col items-start gap-5">
            <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-black uppercase tracking-tight text-white leading-[1.08]">
              BUILD YOUR EXAM<br />
              TABLE <span className="text-neon-mint">IN MINUTES</span>
            </h1>

            <p className="text-sm sm:text-base text-[#94A3B8] max-w-lg leading-relaxed font-normal">
              Turn your university exam routine into a clear, personal schedule. Upload a file,
              add your course codes, and you’re ready to go.
            </p>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#generator"
                className="btn-neon-primary inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider"
              >
                <span>Generate routine</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>

            </div>
          </div>

          {/* Right Side: isometric schedule preview */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center gap-6 relative">
            {/* 3D Isometric Scene */}
            <div className="iso-scene relative w-full max-w-[380px] h-[210px] flex items-center justify-center">
              {/* Lower ambient glow plate */}
              <div className="iso-card-shadow absolute w-[260px] h-[150px] rounded-2xl bg-teal-500/20 border border-teal-400/40 shadow-[0_0_40px_rgba(94,234,212,0.3)] pointer-events-none" />

              {/* Secondary floating glass card */}
              <div className="iso-card-sub absolute top-1 left-2 w-[160px] p-2.5 rounded-xl glass-panel border border-teal-400/40 shadow-2xl z-20">
                <div className="flex items-center justify-between text-[8px] font-mono-code text-teal-300 pb-1.5 border-b border-teal-500/20">
                  <span>MATCHING COURSES</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5EEAD4] led-pulse" />
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-400/30">
                    CSE101
                  </span>
                  <span className="text-[7px] px-1 py-0.5 rounded bg-pink-500/30 text-pink-200 border border-pink-400/30">
                    MAT101
                  </span>
                  <span className="text-[7px] px-1 py-0.5 rounded bg-cyan-500/30 text-cyan-200 border border-cyan-400/30">
                    CSE102
                  </span>
                </div>
              </div>

              {/* Main 3D Floating Tablet */}
              <div className="iso-card-main relative w-[290px] h-[175px] rounded-2xl glass-panel border border-teal-400/60 p-3 shadow-[0_25px_50px_rgba(0,0,0,0.8)] z-10 overflow-hidden">
                {/* Top bar */}
                <div className="flex items-center justify-between pb-2 border-b border-teal-500/30 text-[9px] font-mono-code text-teal-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#5EEAD4]" />
                    <span>EXAM SCHEDULE</span>
                  </div>
                  <span className="text-[8px] text-teal-400/80">FALL SEMESTER</span>
                </div>

                {/* Inner Calendar Grid */}
                <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                  <div className="h-9 rounded-md bg-emerald-500/20 border border-emerald-400/40 p-1 flex flex-col justify-between">
                    <span className="text-[6px] text-emerald-300">10:00 AM</span>
                    <span className="text-[8px] font-bold text-white">CSE101</span>
                  </div>
                  <div className="h-9 rounded-md bg-pink-500/20 border border-pink-400/40 p-1 flex flex-col justify-between">
                    <span className="text-[6px] text-pink-300">02:00 PM</span>
                    <span className="text-[8px] font-bold text-white">MAT101</span>
                  </div>
                  <div className="h-9 rounded-md bg-purple-500/20 border border-purple-400/40 p-1 flex flex-col justify-between">
                    <span className="text-[6px] text-purple-300">10:00 AM</span>
                    <span className="text-[8px] font-bold text-white">CSE102</span>
                  </div>
                  <div className="h-9 rounded-md bg-teal-500/20 border border-teal-400/40 p-1 flex flex-col justify-between">
                    <span className="text-[6px] text-teal-300">02:00 PM</span>
                    <span className="text-[8px] font-bold text-white">PHY101</span>
                  </div>

                  <div className="h-9 rounded-md bg-teal-900/30 border border-teal-500/20 p-1" />
                  <div className="h-9 rounded-md bg-emerald-500/30 border border-emerald-400/50 p-1 flex flex-col justify-between">
                    <span className="text-[6px] text-emerald-300">10:00 AM</span>
                    <span className="text-[8px] font-bold text-white">ENG101</span>
                  </div>
                  <div className="h-9 rounded-md bg-teal-900/30 border border-teal-500/20 p-1" />
                  <div className="h-9 rounded-md bg-purple-500/20 border border-purple-400/40 p-1 flex flex-col justify-between">
                    <span className="text-[6px] text-purple-300">02:00 PM</span>
                    <span className="text-[8px] font-bold text-white">GED101</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </LazySection>

        {/* MAIN DASHBOARD */}
        <LazySection id="generator" className="order-4 w-full pt-6" minHeight="620px">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left part of container */}
            <div className="lg:col-span-8 glass-panel glass-panel--static rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-5 border border-teal-500/35 shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-teal-500/20 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono-code text-xs text-teal-300">01 /</span>
                  <h2 className="text-base sm:text-lg font-semibold text-white">
                    Upload routine and create your personal exam table
                  </h2>
                </div>
                {allExams.length > 0 && (
                  <span className="text-[10px] font-mono-code text-teal-400/70">
                    {allExams.length} EXAMS SYNTHESIZED
                  </span>
                )}
              </div>

              {/* Upload Zone & Course Codes section */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                {/* Drag-and-drop file upload zone with dashed glowing border */}
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`sm:col-span-12 relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed cursor-pointer text-center ${
                    isDragOver
                      ? "border-emerald-400 bg-emerald-950/40"
                      : "border-teal-400/50 bg-teal-950/25"
                  }`}
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.csv"
                    onChange={handleFileChange}
                    ref={inputRef}
                    className="sr-only"
                  />
                  <div className="w-10 h-10 rounded-full bg-teal-500/15 border border-teal-400/40 flex items-center justify-center text-[#5EEAD4] shadow-[0_0_15px_rgba(94,234,212,0.25)]">
                    {uploading ? (
                      <LoaderCircle className="w-5 h-5 animate-spin" />
                    ) : (
                      <Upload className="w-5 h-5" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-white max-w-[240px] truncate">
                    {fileName || "Choose an exam routine file (Excel .xlsx / .xls)"}
                  </span>
                  <span className="mt-1 flex items-center gap-2" aria-hidden="true">
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">
                      <FileSpreadsheet className="h-3 w-3" /> Excel (.xlsx / .xls / .csv)
                    </span>
                  </span>
                </label>

                <div className="sm:col-span-12 flex justify-center text-xs text-slate-400">
                  Need a quick preview?{" "}
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="ml-1 font-medium text-teal-300 underline decoration-teal-300/30 underline-offset-4 transition hover:text-teal-100"
                  >
                    Try a sample routine
                  </button>
                </div>
              </div>

              {/* Removable course-code chips and entry field */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="course-codes"
                  className="text-[10px] font-mono-code uppercase tracking-wider text-teal-400/80 font-semibold"
                >
                  COURSE CODES
                </label>
                <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl glass-card border border-teal-500/30 bg-[#0A1620]/80 px-3 py-2 focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-400">
                  {selectedCourseCodes.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/15 px-2.5 py-1 font-mono-code text-[11px] text-teal-200"
                    >
                      {code}
                      <button
                        type="button"
                        onClick={() => removeCourseCode(code)}
                        aria-label={`Remove ${code}`}
                        className="rounded-full p-0.5 text-teal-200/70 transition hover:bg-teal-400/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                <input
                  id="course-codes"
                  type="text"
                  value={courseDraft}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/[\n,]/.test(value)) {
                      addCourseCodes(value);
                    } else {
                      setCourseDraft(value);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCourseCodes(`${courseDraft},`);
                    } else if (
                      event.key === "Backspace" &&
                      !courseDraft &&
                      selectedCourseCodes.length
                    ) {
                      removeCourseCode(selectedCourseCodes[selectedCourseCodes.length - 1] ?? "");
                    }
                  }}
                  onBlur={() => {
                    if (courseDraft.trim()) addCourseCodes(`${courseDraft},`);
                  }}
                  placeholder="Add a course code…"
                  className="min-w-[150px] flex-1 border-0 bg-transparent px-1 py-1 text-sm font-mono-code text-white placeholder:text-slate-500 focus:outline-none focus:ring-0"
                  aria-describedby="course-codes-hint"
                />
                </div>
                <p id="course-codes-hint" className="text-[11px] text-[#94A3B8]">
                  Press Enter or use a comma to add each course.
                </p>
              </div>

              {/* Glowing "Generate" button and "Clear My Data" ghost button */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-teal-500/15">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating || uploading}
                    className="btn-neon-primary inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider"
                  >
                    {generating ? (
                      <LoaderCircle className="w-4 h-4 animate-spin text-[#041B16]" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-[#041B16]" />
                    )}
                    <span>Generate</span>
                  </button>

                  <button
                    type="button"
                    onClick={clearSavedRoutine}
                    className="btn-ghost-glass inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-mono-code"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-teal-400/70" />
                    <span>Clear My Data</span>
                  </button>
                </div>

                {fileName && (
                  <span className="text-[11px] font-mono-code text-teal-300/70 truncate max-w-[200px]">
                    {fileName}
                  </span>
                )}
              </div>

            </div>

            {/* Right part of container: Three vertically stacked glass cards (Time, Privacy, Calendar) */}
            <div className="lg:col-span-4 flex flex-col gap-3 lg:justify-center">
              {/* Card 1: Time */}
              <div className="flex flex-1 flex-col justify-center gap-1.5 rounded-2xl glass-panel border border-teal-500/25 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)] sm:p-5">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <Clock3 className="w-4 h-4 text-[#5EEAD4]" />
                  <span>Time</span>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Exam dates and times are normalized into a clear, easy-to-scan schedule.
                </p>
              </div>

              {/* Card 2: Privacy */}
              <div className="flex flex-1 flex-col justify-center gap-1.5 rounded-2xl glass-panel border border-teal-500/25 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)] sm:p-5">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#5EEAD4]" />
                  <span>Privacy</span>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Your routine stays on your device. Saved exam data expires automatically after 15 days.
                </p>
              </div>

              {/* Card 3: Calendar */}
              <div className="flex flex-1 flex-col justify-center gap-1.5 rounded-2xl glass-panel border border-teal-500/25 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)] sm:p-5">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <CalendarDays className="w-4 h-4 text-[#5EEAD4]" />
                  <span>Calendar</span>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Connecting Google is optional. Your schedule works without signing in.
                </p>
              </div>
            </div>
          </div>
        </LazySection>

        {/* HOW IT WORKS (THE BLUEPRINT OF EXECUTION) */}
        <LazySection id="how-it-works" className="order-3 w-full pt-8 flex flex-col gap-6" minHeight="420px">
          {/* Headline */}
          <div className="flex items-end justify-between border-b border-teal-500/20 pb-3">
            <div>
              <span className="text-[11px] font-mono-code text-[#5EEAD4] uppercase tracking-widest block mb-1">
                How It Works
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Three simple steps to your schedule
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-1 font-mono-code text-[11px] text-teal-400/60">
              <span>01</span>
              <span className="text-slate-600">/</span>
              <span>03</span>
            </div>
          </div>

          {/* Visuals: Isometric floating platforms 1, 2, 3 + flowchart graphic inside translucent box */}
          <div className="hidden">
            {/* Isometric platforms 1, 2, 3 */}
            <div className="lg:col-span-6 glass-panel rounded-2xl p-5 relative overflow-hidden min-h-[190px] flex items-center justify-center border border-teal-500/25">
              <div className="cyber-grid absolute inset-0 opacity-20" />

              <div className="relative w-full max-w-[340px] h-[130px] flex items-center justify-between">
                {/* Glowing neon connecting lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <line
                    x1="22%"
                    y1="68%"
                    x2="50%"
                    y2="45%"
                    stroke="#5EEAD4"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="laser-line"
                  />
                  <line
                    x1="50%"
                    y1="45%"
                    x2="80%"
                    y2="25%"
                    stroke="#5EEAD4"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="laser-line"
                  />
                </svg>

                {/* Platform 1 */}
                <div className="absolute left-[12%] bottom-[12%] flex flex-col items-center">
                  <div className="iso-pedestal w-14 h-11 rounded-lg bg-gradient-to-br from-teal-500/40 to-emerald-950/80 border border-teal-400/80 flex items-center justify-center shadow-[0_10px_20px_rgba(0,0,0,0.6)]">
                    <span className="iso-pedestal-text font-tech text-lg font-black text-white glow-mint">
                      1
                    </span>
                  </div>
                </div>

                {/* Platform 2 */}
                <div className="absolute left-[44%] top-[30%] flex flex-col items-center">
                  <div className="iso-pedestal w-14 h-11 rounded-lg bg-gradient-to-br from-teal-500/50 to-emerald-900/90 border border-teal-300 flex items-center justify-center shadow-[0_10px_25px_rgba(0,0,0,0.6)]">
                    <span className="iso-pedestal-text font-tech text-lg font-black text-white glow-mint">
                      2
                    </span>
                  </div>
                </div>

                {/* Platform 3 */}
                <div className="absolute right-[10%] top-[8%] flex flex-col items-center">
                  <div className="iso-pedestal w-14 h-11 rounded-lg bg-gradient-to-br from-teal-500/60 to-emerald-800/90 border border-teal-300 flex items-center justify-center shadow-[0_10px_30px_rgba(94,234,212,0.35)]">
                    <span className="iso-pedestal-text font-tech text-lg font-black text-white glow-mint">
                      3
                    </span>
                  </div>
                </div>

                <div className="absolute right-3 bottom-2 text-[9px] font-mono-code text-teal-400/70 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  <span>Step Flowchart</span>
                </div>
              </div>
            </div>

            {/* Flowchart graphic inside translucent box */}
            <div className="lg:col-span-6 flex flex-col gap-3 justify-between">
              {/* Upper flowchart */}
              <div className="glass-panel rounded-xl p-3.5 border border-teal-500/20 relative overflow-hidden flex items-center justify-between">
                <div className="cyber-grid absolute inset-0 opacity-25" />
                <div className="relative z-10 flex items-center gap-3 text-[10px] font-mono-code">
                  <div className="px-2.5 py-1 rounded bg-teal-900/50 border border-teal-500/30 text-teal-200">
                    Parse Engine
                  </div>
                  <span className="text-teal-400">→</span>
                  <div className="px-2.5 py-1 rounded bg-teal-900/50 border border-teal-500/30 text-teal-200">
                    Matrix Match
                  </div>
                  <span className="text-teal-400">→</span>
                  <div className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200">
                    Clean Table
                  </div>
                </div>
                <span className="relative z-10 text-[9px] font-mono-code text-teal-400/60">
                  00:55
                </span>
              </div>

              {/* Lower telemetry panel */}
              <div className="glass-panel rounded-xl p-3.5 border border-teal-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-mono-code text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
                    COURSE CODES
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
                    EXCEL .XLSX
                  </span>
                  <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
                    YOUR ROUTINE
                  </span>
                </div>
                <span className="text-[11px] text-[#94A3B8]">
                  From official routine to your own exam plan.
                </span>
              </div>
            </div>
          </div>

          {/* Clear, evenly sized cards keep the workflow easy to scan. */}
          <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-3">
            {/* Step 1 */}
            <div className="glass-card group flex min-h-[170px] flex-col gap-4 rounded-2xl border border-teal-500/20 bg-gradient-to-br from-[#10242b] to-[#0b151d] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-300/10 font-bold text-lg text-teal-200">
                  1
                </div>
                <h3 className="font-semibold text-base text-white">Upload routine</h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Choose your university routine Excel spreadsheet (.xlsx or .xls format).
              </p>
            </div>

            {/* Step 2 */}
            <div className="glass-card group flex min-h-[170px] flex-col gap-4 rounded-2xl border border-teal-500/20 bg-gradient-to-br from-[#10242b] to-[#0b151d] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-300/10 font-bold text-lg text-teal-200">
                  2
                </div>
                <h3 className="font-semibold text-base text-white">Enter course codes</h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Type or paste the codes you are taking. The parser matches them case-insensitively and ignores dashes.
              </p>
            </div>

            {/* Step 3 */}
            <div className="glass-card group flex min-h-[170px] flex-col gap-4 rounded-2xl border border-teal-500/20 bg-gradient-to-br from-[#10242b] to-[#0b151d] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-300/10 font-bold text-lg text-teal-200">
                  3
                </div>
                <h3 className="font-semibold text-base text-white">Generate and export</h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Review your table, then print it or download a PDF to keep it handy.
              </p>
            </div>
          </div>
        </LazySection>

        {/* TABLE SECTION */}
        <LazySection id="results" className="order-5 w-full pt-8 flex flex-col gap-4" minHeight="360px">
          {/* Header */}
          <div className="results-heading no-print flex flex-wrap items-end justify-between gap-3 border-b border-teal-500/20 pb-3">
            <div>
              <span className="mb-1 block font-mono-code text-[11px] uppercase tracking-widest text-[#5EEAD4]">
                Results
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Your generated exam table
              </h2>
              {generatedExams.length > 0 && (
                <p className="mt-1 text-xs text-[#94A3B8]">
                  Generated: {formatGeneratedDate(new Date())}
                </p>
              )}
            </div>

            {generatedExams.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={exportPdf}
                  className="btn-ghost-glass inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs"
                >
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>Download PDF</span>
                </button>

                <button
                  type="button"
                  onClick={exportPng}
                  disabled={pngExporting}
                  className="btn-ghost-glass inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs"
                >
                  {pngExporting ? (
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin text-teal-400" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-teal-400" />
                  )}
                  <span>{pngExporting ? "Rendering PNG..." : "Download PNG"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="no-print btn-ghost-glass inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs"
                >
                  <Printer className="w-3.5 h-3.5 text-teal-400" />
                  <span>Print PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Show a centered empty state until a routine is generated; results are always a table. */}
          {generatedExams.length === 0 ? (
            <div className="empty-results-panel relative flex min-h-[300px] w-full items-center justify-center overflow-hidden rounded-2xl border border-teal-500/30 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.45)] sm:p-6">
              <div aria-hidden="true" className="empty-results-preview">
                <div className="empty-preview-title"><span>EXAM ROUTINE</span><span>DATE · COURSE · TIME</span></div>
                <div className="empty-preview-row"><i /><i /><i /></div>
                <div className="empty-preview-row"><i /><i /><i /></div>
                <div className="empty-preview-row"><i /><i /><i /></div>
                <div className="empty-preview-row"><i /><i /><i /></div>
              </div>
              <div aria-hidden="true" className="empty-results-scrim" />
              <div
                role="status"
                className="empty-results-card relative z-10 flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-teal-300/25 px-5 py-6 text-center shadow-[0_16px_50px_rgba(0,0,0,0.4)] sm:px-10 sm:py-8"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-teal-300/25 bg-teal-300/10 text-teal-200">
                  <FileText className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-semibold text-white">No exam data yet</h3>
                <p className="max-w-xs text-sm leading-relaxed text-slate-300">
                  Upload a routine above to see your personal exam table here.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="print-header">
                <h1>Exam Routine</h1>
                <p>Generated: {formatGeneratedDate(new Date())}</p>
              </div>
              <div className="print-table-wrapper relative w-full rounded-2xl glass-panel border border-teal-500/30 overflow-x-auto shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
                <table className="routine-table w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-teal-500/30 bg-[#0B1A24]/90 font-mono-code text-teal-300 text-[11px]">
                    <th className="py-3.5 px-4 font-semibold">DATE</th>
                    <th className="py-3.5 px-4 font-semibold">DAY</th>
                    <th className="py-3.5 px-4 font-semibold">TIME</th>
                    <th className="py-3.5 px-4 font-semibold">COURSE</th>
                    <th className="py-3.5 px-4 font-semibold">COURSE TITLE</th>
                    <th className="py-3.5 px-4 font-semibold">FACULTY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-500/15">
                  {generatedExams.map((exam) => (
                    <tr
                      key={exam.id}
                      className="hover:bg-teal-500/10 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono-code text-white whitespace-nowrap">
                        {formatExamDate(exam)}
                      </td>
                      <td className="py-3.5 px-4 text-[#94A3B8] whitespace-nowrap">
                        {getDayName(exam.date)}
                      </td>
                      <td className="py-3.5 px-4 font-mono-code text-[#5EEAD4] whitespace-nowrap">
                        {formatTime(exam.startTime)} – {formatTime(exam.endTime)}
                      </td>
                      <td className="py-3.5 px-4 font-mono-code font-bold text-teal-200 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/30">
                          {exam.courseCode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-white font-medium leading-relaxed whitespace-normal">
                        {exam.courseTitle}
                      </td>
                      <td className="py-3.5 px-4 font-mono-code font-semibold text-teal-100">
                        {formatFaculty(exam.faculty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              <div className="print-footer">ExamMate</div>
            </>
          )}
        </LazySection>

        {/* FAQ SECTION */}
        <LazySection id="faq" className="order-6 w-full pt-8 flex flex-col gap-5" minHeight="360px">
          {/* Headline */}
          <div className="flex items-end justify-between border-b border-teal-500/20 pb-3">
            <div>
              <span className="text-[11px] font-mono-code text-[#5EEAD4] uppercase tracking-widest block mb-1">
                FAQ
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-tech">
                Questions students usually ask
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-1 font-mono-code text-[11px] text-teal-400/60">
              <span>[ // // // ]</span>
            </div>
          </div>

          {/* Accordion-style vertical list of 4 questions */}
          <div className="flex flex-col gap-2.5">
            {faqItems.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl glass-card border border-teal-500/20 overflow-hidden transition-all duration-200"
              >
                <summary className="flex items-center justify-between gap-4 p-4 sm:p-5 cursor-pointer text-sm font-medium text-white hover:text-teal-200 select-none">
                  <span>{item.question}</span>
                  <ChevronDown className="w-4 h-4 text-teal-400 transition-transform duration-200 group-open:rotate-180 flex-shrink-0" />
                </summary>
                <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs text-[#94A3B8] leading-relaxed border-t border-teal-500/10 pt-3">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </LazySection>

        {/* FOOTER */}
        <LazySection as="footer" className="order-7 w-full pt-4 flex flex-col gap-4" minHeight="150px">
          {/* Main Footer Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-teal-500/20 pb-4 text-center sm:text-left">
            {/* Left: ExamMate logo (using icon.svg) and short description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <img
                  src="/icon.svg"
                  alt="ExamMate Logo"
                  className="h-6 w-6"
                />
                <span className="font-tech text-lg font-bold text-white tracking-wider">
                  Exam<span className="text-neon-mint">Mate</span>
                </span>
              </div>
            </div>

            {/* Right: Links for "Privacy Policy" and "Terms and Conditions" */}
            <div className="flex items-center gap-5 text-xs text-[#94A3B8]">
              <a href="/privacy" className="hover:text-teal-300 transition-colors">
                Privacy Policy
              </a>
              <a href="/terms" className="hover:text-teal-300 transition-colors">
                Terms
              </a>
            </div>
          </div>

          {/* Centered credit line */}
          <div className="pb-1 text-center text-[11px] text-[#64748B]">
            © {new Date().getFullYear()} ExamMate <span className="px-1.5 text-teal-500/60">·</span>
            Made by <span className="font-medium text-[#94A3B8]">codewarrior-ahnaf</span>
          </div>
        </LazySection>
      </div>

      <CustomScrollbar />

      {(message || error || savedNotice) && (
        <div className="fixed bottom-5 right-5 z-50 flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2">
          {message && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3 rounded-xl border border-emerald-300/30 bg-[#0c1f1a]/95 px-4 py-3 text-sm text-emerald-100 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex min-w-0 items-start gap-3 rounded-xl border border-rose-300/35 bg-[#271416]/95 px-4 py-3 text-sm text-rose-100 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{error}</span>
            </div>
          )}
          {savedNotice && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3 rounded-xl border border-teal-300/30 bg-[#0b1c20]/95 px-4 py-3 text-sm text-teal-100 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            >
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
              <span>{savedNotice}</span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
