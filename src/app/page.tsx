"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Clock3,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Link2,
  LoaderCircle,
  Printer,
  Send,
  ClipboardPaste,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { formatDate, formatTime, normalizeCourseCode, coursesMatch, hasIncompleteTrailingDot } from "@/lib/date";
import { parseExcelFile } from "@/lib/parsers/excel";
import type { ParsedExam } from "@/lib/parsers/normalize";

const ROUTINE_STORAGE_KEY = "examMate:routine:v1";
const RECENT_DRIVE_LINKS_KEY = "examMate:recentDriveLinks";

// Demo sample exams for instant synthesis test
const SAMPLE_EXAMS: ParsedExam[] = [
  {
    id: "CSE101.1-2026-10-20-10:00",
    courseCode: "CSE101.1",
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
    id: "MAT101.2-2026-10-25-10:00",
    courseCode: "MAT101.2",
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
  {
    id: "CSE181.1-2026-10-31-10:00",
    courseCode: "CSE181.1",
    courseTitle: "Data Structures & Algorithms (Sec 1)",
    date: "2026-10-31",
    startTime: "10:00",
    endTime: "12:00",
    faculty: "Dr. A. Islam (Room 401)",
    program: "B.Sc. in CSE",
  },
  {
    id: "CSE181.5-2026-10-31-14:00",
    courseCode: "CSE181.5",
    courseTitle: "Data Structures & Algorithms (Sec 5)",
    date: "2026-10-31",
    startTime: "14:00",
    endTime: "16:00",
    faculty: "Prof. H. Kabir (Room 405)",
    program: "B.Sc. in CSE",
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
  const trimmed = (faculty ?? "").toString().trim();
  if (!trimmed || /^faculty not listed$/i.test(trimmed)) return "—";
  return trimmed;
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

function isVarsityEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return lower.endsWith("@seu.edu.bd") || lower.endsWith(".edu.bd") || lower.endsWith(".edu");
}

const GOOGLE_BASE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
];

const GOOGLE_DRIVE_SCOPES = [
  ...GOOGLE_BASE_SCOPES,
  "https://www.googleapis.com/auth/drive.readonly",
];

async function startGoogleSignIn(options?: { requireDrive?: boolean }) {
  const scopes = options?.requireDrive ? GOOGLE_DRIVE_SCOPES : GOOGLE_BASE_SCOPES;
  return authClient.signIn.social({
    provider: "google",
    callbackURL: "/",
    errorCallbackURL: "/?auth_error=google_oauth",
    scopes,
    additionalParams: {
      access_type: "offline",
      prompt: "select_account consent",
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
  className = "",
  as: Tag = "section",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
  minHeight?: string;
  as?: "section" | "footer";
}) {
  return (
    <Tag id={id} className={className}>
      {children}
    </Tag>
  );
}

export default function Home() {
  const { data: authSession } = authClient.useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [fileName, setFileName] = useState("");
  const [courseInput, setCourseInput] = useState("");
  const [courseDraft, setCourseDraft] = useState("");
  const [driveLink, setDriveLink] = useState("");
  const [restrictedDriveFileId, setRestrictedDriveFileId] = useState("");
  const [requiresGoogleAuth, setRequiresGoogleAuth] = useState(false);
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
  const [isSampleRoutine, setIsSampleRoutine] = useState(false);
  const isLinkActive = Boolean(driveLink.trim());
  const isFileUploaded = Boolean(fileName && fileName !== "Google Drive link");
  const isTableGenerated = generatedExams.length > 0;
  const isRealRoutineGenerated = isTableGenerated && !isSampleRoutine;
  const hasRoutineSource = Boolean(isFileUploaded || isLinkActive);

  const isUploadDisabled = isLinkActive || uploading || isRealRoutineGenerated;
  const isLinkDisabled = isFileUploaded || isRealRoutineGenerated;
  const isCourseInputDisabled = isRealRoutineGenerated || !hasRoutineSource;

  const [recentLinks, setRecentLinks] = useState<string[]>([]);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [showCalendarSyncPrompt, setShowCalendarSyncPrompt] = useState(false);
  const linkBoxRef = useRef<HTMLDivElement>(null);
  const linkPopupRef = useRef<HTMLDivElement>(null);
  const routineSourceRef = useRef<"excel" | "drive" | "sample">("excel");

  // Auto-dismiss the sync prompt after 8 seconds (toast-like) defaulting to no sync
  useEffect(() => {
    if (!showCalendarSyncPrompt) return;
    const timer = window.setTimeout(() => {
      setShowCalendarSyncPrompt(false);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [showCalendarSyncPrompt]);

  const selectedCourseCodes = useMemo(() => {
    return Array.from(
      new Set(
        courseInput
          .split(/[\n,]+/)
          .map((value) => value.trim().toUpperCase())
          .filter((value) => Boolean(value) && !hasIncompleteTrailingDot(value))
          .map((value) => normalizeCourseCode(value))
      )
    );
  }, [courseInput]);

  const hasEnteredCourse =
    selectedCourseCodes.length > 0 ||
    Boolean(courseDraft.trim() && !hasIncompleteTrailingDot(courseDraft.trim()));

  const isGenerateDisabled =
    generating || uploading || isRealRoutineGenerated || !hasRoutineSource || !hasEnteredCourse;

  const generateDisabledReason = isRealRoutineGenerated
    ? "Routine table is active. Click Clear My Data below to reset."
    : !hasRoutineSource
    ? "Upload an Excel file or paste a Drive link first."
    : !hasEnteredCourse
    ? "Add at least one course code to enable Generate."
    : "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const pendingCourses = window.sessionStorage.getItem("examMate:pendingCourses");
      if (pendingCourses) setCourseInput(pendingCourses);
      const pendingLink = window.sessionStorage.getItem("examMate:pendingDriveLink");
      if (pendingLink) setDriveLink(pendingLink);

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

  // Auto-resume routine generation if redirected back from Google sign-in
  useEffect(() => {
    if (typeof window === "undefined" || !authSession?.user) return;
    try {
      const pendingLink = window.sessionStorage.getItem("examMate:pendingDriveLink");
      const pendingCourses = window.sessionStorage.getItem("examMate:pendingCourses");
      if (pendingLink) {
        window.sessionStorage.removeItem("examMate:pendingDriveLink");
        window.sessionStorage.removeItem("examMate:pendingCourses");
        setDriveLink(pendingLink);
        if (pendingCourses) {
          setCourseInput(pendingCourses);
        }
        window.setTimeout(() => {
          void handleGenerate(pendingLink, pendingCourses || undefined);
        }, 350);
        return;
      }
    } catch {
      // ignore storage errors
    }

    try {
      const justConnected = window.sessionStorage.getItem("examMate:justConnectedGoogle");
      if (justConnected === "true") {
        window.sessionStorage.removeItem("examMate:justConnectedGoogle");
        window.setTimeout(() => {
          const resultsEl = document.getElementById("results");
          if (resultsEl) {
            resultsEl.scrollIntoView({ behavior: "smooth" });
          }
        }, 450);
      }
    } catch {
      // ignore
    }

    // Direct scroll to results section if routine is already generated
    if (generatedExams.length > 0) {
      window.setTimeout(() => {
        const resultsEl = document.getElementById("results");
        if (resultsEl) {
          resultsEl.scrollIntoView({ behavior: "smooth" });
        }
      }, 400);
    }
  }, [authSession?.user, generatedExams.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RECENT_DRIVE_LINKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setRecentLinks(
            parsed.filter(
              (item): item is string =>
                typeof item === "string" && Boolean(item.trim())
            )
          );
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      const isInsideBox = linkBoxRef.current?.contains(target);
      const isInsidePopup = linkPopupRef.current?.contains(target);
      if (!isInsideBox && !isInsidePopup) {
        setShowLinkPopup(false);
      }
    }
    if (showLinkPopup) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [showLinkPopup]);

  function addRecentLink(link: string) {
    const trimmed = link.trim();
    if (!trimmed) return;
    setRecentLinks((prev) => {
      const filtered = prev.filter((item) => item !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 5);
      try {
        window.localStorage.setItem(
          RECENT_DRIVE_LINKS_KEY,
          JSON.stringify(updated)
        );
      } catch {
        // ignore
      }
      return updated;
    });
  }

  function removeRecentLink(linkToRemove: string) {
    setRecentLinks((prev) => {
      const updated = prev.filter((item) => item !== linkToRemove);
      try {
        window.localStorage.setItem(
          RECENT_DRIVE_LINKS_KEY,
          JSON.stringify(updated)
        );
      } catch {
        // ignore
      }
      return updated;
    });
  }

  function clearAllRecentLinks() {
    setRecentLinks([]);
    try {
      window.localStorage.removeItem(RECENT_DRIVE_LINKS_KEY);
    } catch {
      // ignore
    }
  }

  function handleDriveInputChange(val: string) {
    if (isRealRoutineGenerated) return;
    if (isSampleRoutine && val.trim()) {
      setIsSampleRoutine(false);
      setGeneratedExams([]);
      setFileName("");
      setCourseInput("");
      setCourseDraft("");
    }
    setDriveLink(val);
  }

  async function handlePasteFromClipboard() {
    if (isLinkDisabled) return;
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard API not supported");
      }
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const trimmed = text.trim();
        handleDriveInputChange(trimmed);
        addRecentLink(trimmed);
        setShowLinkPopup(false);
        setMessage("Google Drive link pasted from clipboard.");
      } else {
        setError("Clipboard is empty or does not contain text.");
      }
    } catch {
      setError("Please press Ctrl+V to paste your link.");
    }
  }

  async function syncCalendar(exams = generatedExams) {
    if (!authSession || !exams.length || isSampleRoutine || routineSourceRef.current === "sample") return;
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
    if (!authSession || !generatedExams.length || isSampleRoutine || routineSourceRef.current === "sample") return;
    const syncKey = JSON.stringify(generatedExams);
    try {
      const pendingSync = window.sessionStorage.getItem("examMate:pendingCalendarSync");
      if (pendingSync === "true") {
        window.sessionStorage.removeItem("examMate:pendingCalendarSync");
        if (lastCalendarSyncRef.current !== syncKey) {
          lastCalendarSyncRef.current = syncKey;
          void syncCalendar(generatedExams);
        }
        return;
      }
    } catch {
      // ignore
    }

    // Auto-sync for routines generated via Excel file when Google is connected
    if (routineSourceRef.current === "excel") {
      if (lastCalendarSyncRef.current !== syncKey) {
        lastCalendarSyncRef.current = syncKey;
        void syncCalendar(generatedExams);
      }
    }
  }, [authSession, generatedExams, isSampleRoutine]);

  function persistRoutine(exams: ParsedExam[]) {
    // Only persist actual user routines, never sample routines (so tab close clears sample routine)
    if (isSampleRoutine) {
      return;
    }
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
    if (isRealRoutineGenerated) {
      setError(
        "An exam routine table is already generated. Click 'Clear My Data' below to reset and upload a new file."
      );
      return;
    }
    routineSourceRef.current = "excel";
    if (isSampleRoutine) {
      setIsSampleRoutine(false);
      setGeneratedExams([]);
      setCourseInput("");
      setCourseDraft("");
    }
    setUploading(true);
    setError("");
    setMessage("");
    setFileName(file.name);
    setDriveLink("");
    setShowLinkPopup(false);

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

  async function loadExamsFromDrive(link: string): Promise<ParsedExam[]> {
    const response = await fetch("/api/drive/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link }),
    });
    if (!response.ok) {
      const details = (await response.json().catch(() => ({}))) as {
        error?: string;
        fileId?: string;
        requiresGoogleAuth?: boolean;
      };
      if (details.fileId) {
        setRestrictedDriveFileId(details.fileId);
      }
      if (details.requiresGoogleAuth) {
        setRequiresGoogleAuth(true);
      }
      throw new Error(details.error || "Could not read this Google Drive link.");
    }
    setRestrictedDriveFileId("");
    setRequiresGoogleAuth(false);
    const blob = await response.blob();
    const name = response.headers.get("X-File-Name") || "drive-routine.xlsx";
    const parsed = await parseRoutineFile(new File([blob], name));
    if (!parsed.length) {
      throw new Error(
        "No valid exams found in the linked file. Verify it includes Course Code, Date, and Time columns."
      );
    }
    return sortExams(parsed);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (isRealRoutineGenerated) {
      setError(
        "An exam routine table is already generated. Click 'Clear My Data' below to reset and upload a new file."
      );
      return;
    }
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    void handleFileUpload(nextFile);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (isRealRoutineGenerated) {
      setError(
        "An exam routine table is already generated. Click 'Clear My Data' below to reset and upload a new file."
      );
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  }

  function clearUploadedFile() {
    setFileName("");
    setRestrictedDriveFileId("");
    setRequiresGoogleAuth(false);
    setAllExams([]);
    if (inputRef.current) inputRef.current.value = "";
    setMessage("");
  }

  function clearDriveLink() {
    setDriveLink("");
    setShowLinkPopup(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("examMate:pendingDriveLink");
      window.localStorage.removeItem("examMate:savedDriveLink");
    }
    setRestrictedDriveFileId("");
    setRequiresGoogleAuth(false);
    if (fileName === "Google Drive link") {
      setFileName("");
      setAllExams([]);
    }
    setMessage("");
  }

  function addCourseCodes(value: string) {
    const rawTokens = value.split(/[\n,]+/);
    const validCodes: string[] = [];
    let remainingDraft = "";

    rawTokens.forEach((token, index) => {
      const trimmed = token.trim().toUpperCase();
      if (!trimmed) return;
      if (hasIncompleteTrailingDot(trimmed)) {
        if (index === rawTokens.length - 1) {
          remainingDraft = trimmed;
        }
        return;
      }
      validCodes.push(normalizeCourseCode(trimmed));
    });

    if (validCodes.length) {
      const nextCodes = Array.from(new Set([...selectedCourseCodes, ...validCodes])).join(", ");
      setCourseInput(nextCodes);
    }
    setCourseDraft(remainingDraft);
  }

  function removeCourseCode(codeToRemove: string) {
    const nextCodes = selectedCourseCodes.filter((code) => code !== codeToRemove).join(", ");
    setCourseInput(nextCodes);
  }

  async function handleGenerate(overrideLink?: string, overrideCourses?: string) {
    const rawLink = typeof overrideLink === "string" ? overrideLink : driveLink;
    const link = rawLink.trim();
    if (!link && !allExams.length) {
      setError("Upload an exam routine file or paste a Google Drive link before generating.");
      return;
    }

    const effectiveCourseSource = typeof overrideCourses === "string" ? overrideCourses : courseInput;
    const pendingDraft = courseDraft.trim().toUpperCase();
    let effectiveSelectedCodes = Array.from(
      new Set(
        effectiveCourseSource
          .split(/[\n,]+/)
          .map((v) => v.trim().toUpperCase())
          .filter((v) => Boolean(v) && !hasIncompleteTrailingDot(v))
          .map((v) => normalizeCourseCode(v))
      )
    );

    if (pendingDraft && !hasIncompleteTrailingDot(pendingDraft)) {
      const normalized = normalizeCourseCode(pendingDraft);
      if (!effectiveSelectedCodes.includes(normalized)) {
        effectiveSelectedCodes = [...effectiveSelectedCodes, normalized];
        const nextText = effectiveSelectedCodes.join(", ");
        setCourseInput(nextText);
        setCourseDraft("");
      }
    }

    if (!effectiveSelectedCodes.length) {
      setError("Add at least one course code to build your personal exam table.");
      return;
    }

    setGenerating(true);
    setError("");
    setMessage("");

    // A pasted Drive link takes priority: scan it in the background, then build the table.
    let sourceExams = allExams;
    if (link) {
      addRecentLink(link);
      setShowLinkPopup(false);

      const userEmail = authSession?.user?.email;
      const isVarsity = isVarsityEmail(userEmail);

      if (!isVarsity) {
        try {
          window.sessionStorage.setItem("examMate:pendingDriveLink", link);
          window.sessionStorage.setItem(
            "examMate:pendingCourses",
            effectiveSelectedCodes.join(", ")
          );
          if (authSession?.user) {
            await authClient.signOut();
          }
          setGoogleLoading(true);
          setMessage("Redirecting to Google to connect your varsity email (@seu.edu.bd)…");
          await startGoogleSignIn({ requireDrive: true });
          return;
        } catch (signInErr) {
          setError(
            signInErr instanceof Error
              ? signInErr.message
              : "Could not start Google connection. Please connect your varsity email (@seu.edu.bd) in the navbar."
          );
          setGenerating(false);
          setGoogleLoading(false);
          return;
        }
      }

      try {
        sourceExams = await loadExamsFromDrive(link);
        setAllExams(sourceExams);
        setFileName("Google Drive link");
      } catch (driveError) {
        setError(
          driveError instanceof Error
            ? driveError.message
            : "Could not read this Google Drive link."
        );
        setGenerating(false);
        return;
      }
    }

    // Strictly match selected course codes (matching exact section when specified e.g. CSE181.5)
    const matchedExams: ParsedExam[] = [];
    for (const exam of sourceExams) {
      const matchedUserCode = effectiveSelectedCodes.find((code) =>
        coursesMatch(code, exam.courseCode)
      );
      if (matchedUserCode) {
        // If the user specified a section (e.g. CSE181.5) but the routine had no section (CSE181),
        // display the user's specific code in the table for clear identification
        const userHasSection = /\.\d+$/.test(matchedUserCode);
        const routineHasSection = /\.\d+$/.test(exam.courseCode);
        const finalCourseCode =
          userHasSection && !routineHasSection ? matchedUserCode : exam.courseCode;

        matchedExams.push({
          ...exam,
          courseCode: finalCourseCode,
        });
      }
    }

    // Deduplicate any repeated entries by courseCode, date, and time
    const seenExamKeys = new Set<string>();
    const uniqueMatches: ParsedExam[] = [];
    for (const item of matchedExams) {
      const key = `${item.courseCode}|${item.date}|${item.startTime}`;
      if (!seenExamKeys.has(key)) {
        seenExamKeys.add(key);
        uniqueMatches.push(item);
      }
    }

    const matches = sortExams(uniqueMatches);
    const unmatched = effectiveSelectedCodes.filter(
      (code) => !sourceExams.some((exam) => coursesMatch(code, exam.courseCode))
    );

    setGeneratedExams(matches);
    persistRoutine(matches);

    // In both sample and real routine generation, clear the input boxes
    setFileName("");
    setDriveLink("");
    setCourseInput("");
    setCourseDraft("");
    if (inputRef.current) inputRef.current.value = "";

    if (!isSampleRoutine) {
      setAllExams([]);
    }

    if (!matches.length) {
      setError(`No matches found for: ${unmatched.join(", ")} in routine.`);
      setGenerating(false);
      return;
    }

    if (isSampleRoutine) {
      routineSourceRef.current = "sample";
      setShowCalendarSyncPrompt(false);
      setMessage(
        `${matches.length} exam${matches.length > 0 ? "s" : ""} generated! (Sample preview — not linked to Google)`
      );
    } else if (link) {
      routineSourceRef.current = "drive";
      setShowCalendarSyncPrompt(true);
      setMessage(
        `${matches.length} exam${matches.length > 0 ? "s" : ""} generated! ${
          unmatched.length ? `Unmatched: ${unmatched.join(", ")}.` : ""
        }`
      );
    } else {
      routineSourceRef.current = "excel";
      setShowCalendarSyncPrompt(false);
      setMessage(
        `${matches.length} exam${matches.length > 0 ? "s" : ""} generated! ${
          unmatched.length ? `Unmatched: ${unmatched.join(", ")}.` : ""
        }`
      );
    }
    setGenerating(false);

    // Scroll to results table section
    const resultsElement = document.getElementById("results");
    if (resultsElement) {
      resultsElement.scrollIntoView({ behavior: "smooth" });
    }
  }

  function handleLoadSample() {
    if (generatedExams.length > 0) {
      setError(
        "An exam routine table is already generated. Click 'Clear My Data' below to reset before trying a sample routine."
      );
      return;
    }
    routineSourceRef.current = "sample";
    lastCalendarSyncRef.current = "";
    setShowCalendarSyncPrompt(false);
    setIsSampleRoutine(true);
    setGeneratedExams([]);
    try {
      window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
    } catch {
      // ignore
    }
    setAllExams(SAMPLE_EXAMS);
    setFileName("Sample_Exam_Routine_Fall2026.xlsx");
    setDriveLink("");
    setShowLinkPopup(false);
    setCourseInput("CSE101.1, CSE181.5, MAT101.2");
    setCourseDraft("");
    setError("");
    setMessage("Sample routine loaded. Click Generate to build your table.");
  }

  function clearSavedRoutine() {
    lastCalendarSyncRef.current = "";
    setShowCalendarSyncPrompt(false);
    setIsSampleRoutine(false);
    setGeneratedExams([]);
    setCourseInput("");
    setCourseDraft("");
    setFileName("");
    setDriveLink("");
    setShowLinkPopup(false);
    setAllExams([]);
    if (inputRef.current) inputRef.current.value = "";
    try {
      window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSavedNotice("");
    setMessage("Cleared your local exam routine data.");
  }

  async function handleGoogleConnect() {
    if (isSampleRoutine) {
      setError("Google connection is disabled for sample routines. Please upload your routine or paste a Drive link to sync.");
      return;
    }
    if (driveLink.trim()) {
      try {
        window.sessionStorage.setItem("examMate:pendingDriveLink", driveLink.trim());
        if (selectedCourseCodes.length) {
          window.sessionStorage.setItem("examMate:pendingCourses", selectedCourseCodes.join(", "));
        }
      } catch {
        // ignore
      }
    }
    try {
      window.sessionStorage.setItem("examMate:justConnectedGoogle", "true");
    } catch {
      // ignore
    }
    setGoogleLoading(true);
    setError("");
    try {
      const requireDrive = Boolean(isLinkActive || routineSourceRef.current === "drive");
      const result = await startGoogleSignIn({ requireDrive });
      if (result?.error) {
        throw new Error(result.error.message || "Google sign-in could not start.");
      }
      if (generatedExams.length > 0) {
        window.setTimeout(() => {
          const resultsEl = document.getElementById("results");
          if (resultsEl) {
            resultsEl.scrollIntoView({ behavior: "smooth" });
          }
        }, 400);
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

  async function buildPdfDocument() {
    const [{ jsPDF, GState }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

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

  async function exportPdf() {
    if (!generatedExams.length) {
      setError("Synthesize your exam table first before exporting a PDF.");
      return;
    }
    const doc = await buildPdfDocument();
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
      const doc = await buildPdfDocument();
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
        "Yes, absolutely. You can upload an Excel routine file (.xlsx, .xls, .csv), enter your course codes, and synthesize your exam table immediately without signing in or providing any credentials.",
    },
    {
      question: "How does the Google Drive link import work?",
      answer:
        "Simply paste your shared Google Drive or Google Sheets link in Option 2. If the link is restricted to Southeast University (@seu.edu.bd) accounts, clicking Generate will prompt a one-click Google Sign-In. ExamMate reads the spreadsheet securely in the background via read-only Google Drive API and builds your routine table automatically.",
    },
    {
      question: "Which file formats can I upload?",
      answer:
        "Excel spreadsheet files (.xlsx, .xls, .xlsm, and .csv) as well as Google Drive share links are fully supported. The parser scans and detects relevant column headers (Course Code, Date, Time, Room, and Faculty) automatically.",
    },
    {
      question: "What happens to my data and privacy?",
      answer:
        "Your routine file is processed in memory and never stored on our servers. Your synthesized routine table is saved locally on your device for up to 15 days so you do not have to regenerate it on returning visits. Draft upload fields reset cleanly when you close your browser tab.",
    },
    {
      question: "Can I sync my schedule to Google Calendar?",
      answer:
        "Yes. Connect your Google account to automatically add your exams to your primary Google Calendar with course codes, dates, and times, complete with advance reminders (9:00 AM and 8:00 PM the day before each exam).",
    },
  ];

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
              width="28"
              height="28"
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
              disabled={googleLoading || calendarSyncing || (!authSession && !isRealRoutineGenerated && !isLinkActive)}
              aria-label={
                isSampleRoutine
                  ? "Sample routine is for preview only and does not link with Google."
                  : authSession
                  ? "Disconnect Google. Synced events will remain in Google Calendar."
                  : isRealRoutineGenerated || isLinkActive
                  ? "Connect Google and sync this routine"
                  : "Generate a routine before connecting Google"
              }
              className={`google-connect-button group ${
                authSession
                  ? "google-connect-button--connected"
                  : isRealRoutineGenerated || isLinkActive
                    ? "google-connect-button--ready google-connect-button--connect"
                    : "google-connect-button--disabled google-connect-button--connect"
              }`}
            >
              {googleLoading || calendarSyncing ? (
                <LoaderCircle className="h-5 w-5 animate-spin text-teal-300" />
              ) : (
                <img src="/google-logo.svg" alt="" aria-hidden="true" width="19" height="19" className="google-connect-logo shrink-0" />
              )}
              {!authSession && <span className="whitespace-nowrap text-[11px] font-medium tracking-wide sm:text-[13px]">Connect Google</span>}
            </button>
            <span role="tooltip" className="pointer-events-none absolute right-0 top-[calc(100%+1.25rem)] z-50 w-max max-w-[min(18rem,calc(100vw-2rem))] translate-y-1 rounded-lg border border-teal-200/25 bg-[#0b171f]/95 px-3 py-2 text-xs leading-relaxed text-teal-50 opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl transition duration-200 group-hover/google:translate-y-0 group-hover/google:opacity-100 group-focus-within/google:translate-y-0 group-focus-within/google:opacity-100">
              {isSampleRoutine
                ? authSession
                  ? `Connected (${authSession.user?.email || "Google"}) — Sample routine is not linked or synced.`
                  : "Sample routine is for preview only and will not link with Google."
                : authSession
                ? `Connected Google (${authSession.user?.email || "Google"}). Click to Disconnect`
                : isLinkActive
                  ? "Connect your varsity Google account (@seu.edu.bd) to generate routine from Drive link."
                  : isRealRoutineGenerated
                  ? "Connect Google to sync this exam routine and set reminders."
                  : "Generate your exam routine before connecting Google."}
            </span>
          </div>
        </header>

        <main id="main-content" className="contents">
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
                {/* OPTION 1: Drag-and-drop file upload zone */}
                <div className="sm:col-span-12 relative flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono-code uppercase tracking-wider text-teal-400/80 font-semibold">
                      OPTION 1: UPLOAD EXCEL FILE
                    </span>
                  </div>

                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!isUploadDisabled) setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      if (isRealRoutineGenerated) {
                        e.preventDefault();
                        setError(
                          "An exam routine table is already generated. Click 'Clear My Data' below to reset and upload a new file."
                        );
                        return;
                      }
                      if (isUploadDisabled) return;
                      handleDrop(e);
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed text-center transition-all ${
                      isUploadDisabled
                        ? "opacity-35 cursor-not-allowed border-slate-700 bg-slate-950/40 pointer-events-none"
                        : isDragOver
                        ? "border-emerald-400 bg-emerald-950/40 cursor-pointer"
                        : "border-teal-400/50 bg-teal-950/25 cursor-pointer hover:border-teal-300"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".xlsx,.xls,.xlsm,.csv"
                      onChange={handleFileChange}
                      ref={inputRef}
                      disabled={isUploadDisabled}
                      className="sr-only"
                    />
                    <div className="w-10 h-10 rounded-full bg-teal-500/15 border border-teal-400/40 flex items-center justify-center text-[#5EEAD4] shadow-[0_0_15px_rgba(94,234,212,0.25)]">
                      {uploading && !isLinkActive ? (
                        <LoaderCircle className="w-5 h-5 animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-white max-w-[280px] truncate">
                      {isRealRoutineGenerated
                        ? "Upload disabled (routine table generated) — clear data to upload"
                        : isLinkActive
                        ? "Upload disabled (Drive link is active below)"
                        : isFileUploaded
                        ? fileName
                        : "Choose an exam routine file (Excel .xlsx / .xls / .csv)"}
                    </span>
                    {isFileUploaded && !isLinkActive && !isRealRoutineGenerated ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clearUploadedFile();
                        }}
                        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-rose-500/40 bg-rose-500/15 text-xs font-mono-code text-rose-300 hover:bg-rose-500/25 hover:text-rose-100 transition shadow-sm pointer-events-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove file
                      </button>
                    ) : (
                      <span className="mt-1 flex items-center gap-2" aria-hidden="true">
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">
                          <FileSpreadsheet className="h-3 w-3" /> Excel (.xlsx / .xls / .csv)
                        </span>
                      </span>
                    )}
                  </label>
                  {!isRealRoutineGenerated && isLinkActive ? (
                    <p className="text-[10px] text-amber-300/80 font-mono-code">
                      * Upload is disabled because a Drive link is entered. Clear the link below to upload a file instead.
                    </p>
                  ) : null}
                </div>

                {/* OPTION 2: Google Drive share-link import */}
                <div className="sm:col-span-12 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="drive-link"
                      className="text-[10px] font-mono-code uppercase tracking-wider text-teal-400/80 font-semibold"
                    >
                      OPTION 2: PASTE GOOGLE DRIVE LINK
                    </label>
                  </div>
                  <div className="relative">
                    <div
                      ref={linkBoxRef}
                      onClick={() => {
                        if (!isLinkDisabled) {
                          setShowLinkPopup(true);
                          const input = document.getElementById("drive-link") as HTMLInputElement | null;
                          input?.focus();
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isLinkDisabled) {
                          setShowLinkPopup(true);
                          const input = document.getElementById("drive-link") as HTMLInputElement | null;
                          input?.focus();
                        }
                      }}
                      className={`relative flex min-h-11 items-center gap-2 rounded-xl border px-3 transition-all duration-200 select-none ${
                        isLinkDisabled
                          ? "opacity-35 cursor-not-allowed border-slate-700 bg-slate-950/40 pointer-events-none"
                          : isLinkActive
                          ? "border-teal-500/30 bg-[#0A1620]/80 focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-400"
                          : "border-teal-400/50 bg-teal-950/25 cursor-pointer hover:border-teal-300 focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-400"
                      }`}
                    >
                      <Link2 className="h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
                      <input
                        id="drive-link"
                        name="examMateDriveLinkInput"
                        type="text"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-lpignore="true"
                        value={driveLink}
                        disabled={isLinkDisabled}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!isLinkDisabled) setShowLinkPopup(true);
                        }}
                        onClick={() => {
                          if (!isLinkDisabled) setShowLinkPopup(true);
                        }}
                        onFocus={() => {
                          if (!isLinkDisabled) setShowLinkPopup(true);
                        }}
                        onChange={(event) => {
                          handleDriveInputChange(event.target.value);
                        }}
                        onPaste={(event) => {
                          if (isRealRoutineGenerated) {
                            event.preventDefault();
                            setError(
                              "An exam routine table is already generated. Click 'Clear My Data' below to reset and paste a new link."
                            );
                            return;
                          }
                          const pasted = event.clipboardData.getData("text");
                          if (pasted && pasted.trim()) {
                            handleDriveInputChange(pasted.trim());
                            addRecentLink(pasted.trim());
                            setShowLinkPopup(false);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setShowLinkPopup(false);
                          } else if (event.key === "Enter") {
                            event.preventDefault();
                            setShowLinkPopup(false);
                            if (hasEnteredCourse) {
                              void handleGenerate();
                            }
                          }
                        }}
                        placeholder={
                          isRealRoutineGenerated
                            ? "Link disabled (routine table generated)"
                            : isFileUploaded
                            ? `Link disabled (${fileName} uploaded)`
                            : "https://drive.google.com/file/d/…/view"
                        }
                        className="w-full border-0 bg-transparent py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
                      />
                      {isLinkActive && !isFileUploaded && !isRealRoutineGenerated && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearDriveLink();
                            setShowLinkPopup(false);
                          }}
                          aria-label="Clear drive link"
                          className="rounded-full p-1 text-slate-400 hover:text-white transition"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Compact Custom Popup on left click */}
                    {showLinkPopup && !isLinkDisabled && (
                      <div
                        ref={linkPopupRef}
                        role="dialog"
                        aria-label="Google Drive link options"
                        className="absolute left-3 top-[calc(100%+6px)] z-50 w-auto min-w-[200px] max-w-[300px] rounded-lg border border-teal-500/40 bg-[#0B1520]/95 backdrop-blur-md p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.65),0_0_15px_rgba(94,234,212,0.15)] animate-in fade-in zoom-in-95 duration-100"
                      >
                        {/* Upward caret arrow */}
                        <div className="absolute left-5 -top-1.5 h-2.5 w-2.5 rotate-45 border-l border-t border-teal-500/40 bg-[#0B1520]" />

                        {/* Compact Paste from Clipboard Button */}
                        <button
                          type="button"
                          onClick={() => void handlePasteFromClipboard()}
                          className="flex w-full items-center justify-between gap-2.5 rounded-md bg-teal-500/15 px-2.5 py-1.5 text-xs font-medium text-teal-200 transition hover:bg-teal-500/25 border border-teal-500/30"
                        >
                          <div className="flex items-center gap-1.5">
                            <ClipboardPaste className="h-3.5 w-3.5 text-teal-300 shrink-0" />
                            <span>Paste from clipboard</span>
                          </div>
                          <span className="font-mono-code text-[9px] text-teal-400/70">Ctrl+V</span>
                        </button>

                        {/* Recent Links (compact) */}
                        {recentLinks.length > 0 && (
                          <div className="mt-1 flex flex-col gap-0.5 border-t border-teal-500/15 pt-1">
                            <div className="flex items-center justify-between px-1 text-[9px] font-mono-code text-teal-400/70">
                              <span>RECENT</span>
                              <button
                                type="button"
                                onClick={clearAllRecentLinks}
                                className="hover:text-rose-400 transition"
                              >
                                Clear
                              </button>
                            </div>
                            {recentLinks.slice(0, 3).map((link) => (
                              <div
                                key={link}
                                className="group flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[11px] hover:bg-teal-500/15 transition cursor-pointer"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDriveInputChange(link);
                                    setShowLinkPopup(false);
                                  }}
                                  className="truncate font-mono-code text-[10px] text-teal-100 hover:text-white text-left flex-1"
                                >
                                  {link}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeRecentLink(link);
                                  }}
                                  aria-label="Remove"
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 p-0.5"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isRealRoutineGenerated ? null : isFileUploaded ? (
                    <p className="text-[10px] text-amber-300/80 font-mono-code">
                      * Drive link is disabled because an Excel file is already uploaded ({fileName}). Click &quot;Remove file&quot; above to use a link instead.
                    </p>
                  ) : (
                    <p className="text-[11px] text-[#94A3B8]">
                      Paste link, enter course codes, then press Generate.
                    </p>
                  )}
                </div>

                <div className="sm:col-span-12 flex justify-center text-xs text-slate-400">
                  Need a quick preview?{" "}
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    disabled={generatedExams.length > 0}
                    className={`ml-1 font-medium transition ${
                      generatedExams.length > 0
                        ? "text-slate-600 cursor-not-allowed no-underline opacity-50"
                        : "text-teal-300 underline decoration-teal-300/30 underline-offset-4 hover:text-teal-100 cursor-pointer"
                    }`}
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
                <div
                  onContextMenu={(e) => e.preventDefault()}
                  className={`flex min-h-12 flex-wrap items-center gap-2 rounded-xl glass-card border px-3 py-2 transition-all ${
                    isCourseInputDisabled
                      ? "opacity-40 cursor-not-allowed border-slate-700 bg-slate-950/40"
                      : "border-teal-500/30 bg-[#0A1620]/80 focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-400"
                  }`}
                >
                  {selectedCourseCodes.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/15 px-2.5 py-1 font-mono-code text-[11px] text-teal-200"
                    >
                      {code}
                      {!isCourseInputDisabled && (
                        <button
                          type="button"
                          onClick={() => removeCourseCode(code)}
                          aria-label={`Remove ${code}`}
                          className="rounded-full p-0.5 text-teal-200/70 transition hover:bg-teal-400/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  ))}
                  <input
                    id="course-codes"
                    type="text"
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={isCourseInputDisabled}
                    value={courseDraft}
                    onChange={(event) => {
                      if (isCourseInputDisabled) return;
                      const value = event.target.value.toUpperCase();
                      if (/[\n,]/.test(value)) {
                        addCourseCodes(value);
                      } else {
                        setCourseDraft(value);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (isCourseInputDisabled) return;
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const trimmed = courseDraft.trim().toUpperCase();
                        if (!trimmed || hasIncompleteTrailingDot(trimmed)) {
                          return;
                        }
                        addCourseCodes(`${trimmed},`);
                      } else if (
                        event.key === "Backspace" &&
                        !courseDraft &&
                        selectedCourseCodes.length
                      ) {
                        removeCourseCode(selectedCourseCodes[selectedCourseCodes.length - 1] ?? "");
                      }
                    }}
                    onBlur={() => {
                      if (isCourseInputDisabled) return;
                      const trimmed = courseDraft.trim().toUpperCase();
                      if (trimmed && !hasIncompleteTrailingDot(trimmed)) {
                        addCourseCodes(`${trimmed},`);
                      }
                    }}
                    placeholder={
                      isRealRoutineGenerated
                        ? "Locked (routine table generated) — click Clear My Data"
                        : !hasRoutineSource
                        ? "Upload routine file or paste Drive link first…"
                        : "Add course code (e.g. CSE181.5)…"
                    }
                    className="min-w-[150px] flex-1 border-0 bg-transparent px-1 py-1 text-sm font-mono-code uppercase text-white placeholder:text-slate-500 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
                    aria-describedby="course-codes-hint"
                  />
                </div>
                {isRealRoutineGenerated ? (
                  <p id="course-codes-hint" className="text-[10px] text-amber-300/80 font-mono-code">
                    * Routine table is active. Click &quot;Clear My Data&quot; below to reset and generate a new routine.
                  </p>
                ) : !hasRoutineSource ? (
                  <p id="course-codes-hint" className="text-[11px] text-slate-400">
                    Upload an Excel routine file or paste a Google Drive link above to unlock course codes.
                  </p>
                ) : hasIncompleteTrailingDot(courseDraft) ? (
                  <p id="course-codes-hint" className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                    <span>Dot (.) এর পর সেকশন নাম্বার লিখুন (যেমন .5), তারপর Enter চাপুন।</span>
                  </p>
                ) : (
                  <p id="course-codes-hint" className="text-[11px] text-[#94A3B8]">
                    Press Enter or use a comma to add each course (e.g. CSE181.5).
                  </p>
                )}
              </div>

              {/* Glowing "Generate" button and "Clear My Data" ghost button */}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-4 border-t border-teal-500/15">
                <div className="flex items-center gap-3">
                  <div className={`group/gen relative inline-flex ${isGenerateDisabled ? "cursor-not-allowed" : ""}`}>
                    <button
                      type="button"
                      onClick={() => void handleGenerate()}
                      disabled={isGenerateDisabled}
                      aria-label="Generate personal exam table"
                      className="btn-neon-primary inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none shadow-[0_0_20px_rgba(94,234,212,0.35)]"
                    >
                      {generating ? (
                        <LoaderCircle className="w-4 h-4 animate-spin text-[#041B16]" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-[#041B16]" />
                      )}
                      <span>{generating ? "Generating…" : "Generate"}</span>
                    </button>

                    {/* Custom Glassmorphic Tooltip */}
                    {generateDisabledReason && (
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute bottom-[calc(100%+0.65rem)] left-0 z-50 w-max max-w-[min(22rem,calc(100vw-2.5rem))] translate-y-1 rounded-xl border border-teal-400/35 bg-[#0A1822]/95 backdrop-blur-xl px-3.5 py-1.5 text-xs font-medium text-teal-100 opacity-0 shadow-[0_12px_30px_rgba(0,0,0,0.65),0_0_15px_rgba(94,234,212,0.18)] transition-all duration-200 group-hover/gen:translate-y-0 group-hover/gen:opacity-100"
                      >
                        <div className="flex items-center gap-1.5 whitespace-normal sm:whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0 shadow-[0_0_6px_rgba(94,234,212,0.8)]" />
                          <span>{generateDisabledReason}</span>
                        </div>
                        <div className="absolute -bottom-1 left-7 w-2 h-2 rotate-45 border-r border-b border-teal-400/35 bg-[#0A1822]" />
                      </div>
                    )}
                  </div>

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
        <LazySection id="how-it-works" className="content-auto-render order-3 w-full pt-8 flex flex-col gap-6" minHeight="420px">
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
                <h3 className="font-semibold text-base text-white">Upload or Paste Link</h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Choose between uploading an Excel file (.xlsx / .xls / .csv) or pasting a Google Drive link.
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
        <LazySection id="results" className="content-auto-render order-5 w-full pt-8 flex flex-col gap-4" minHeight="360px">
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
                className="empty-results-card group/empty relative z-10 flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl px-5 py-6 text-center sm:px-10 sm:py-8 cursor-default select-none"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-400/10 text-teal-200 shadow-[0_0_15px_rgba(94,234,212,0.15)] transition-all duration-300 group-hover/empty:scale-110 group-hover/empty:border-teal-300/60 group-hover/empty:bg-teal-400/20 group-hover/empty:text-white group-hover/empty:shadow-[0_0_25px_rgba(94,234,212,0.4)]">
                  <FileText className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-semibold text-white tracking-tight transition-colors duration-300 group-hover/empty:text-[#5EEAD4]">
                  No exam data yet
                </h3>
                <p className="max-w-xs text-sm leading-relaxed text-slate-300 transition-colors duration-300 group-hover/empty:text-slate-100">
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

              {/* Table Container with In-Table Frosted Glass Sync Overlay */}
              <div className="relative w-full">
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

                {/* In-Table Compact Frosted Glass Sync Overlay */}
                {showCalendarSyncPrompt && generatedExams.length > 0 && !isSampleRoutine && (
                  <div className="no-print absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-none">
                    <div
                      role="dialog"
                      aria-label="Google Calendar Sync Prompt"
                      className="pointer-events-auto relative flex flex-col items-center gap-2.5 rounded-2xl border border-teal-400/35 bg-[#0A1822]/85 backdrop-blur-xl px-6 py-3.5 text-center shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_20px_rgba(94,234,212,0.18)] max-w-xs animate-in fade-in zoom-in-95 duration-200"
                    >
                      <span className="text-xs sm:text-[13px] font-semibold text-white tracking-wide whitespace-nowrap">
                        Sync with Google Calendar?
                      </span>

                      {/* 2 icon buttons: Cross & Correct with custom frosted glass tooltips */}
                      <div className="flex items-center justify-center gap-5">
                        {/* Cross Button: Cancel / Do not sync */}
                        <div className="group/cancel relative inline-flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => setShowCalendarSyncPrompt(false)}
                            aria-label="Do not sync with Google Calendar"
                            className="flex items-center justify-center bg-transparent border-0 text-rose-400 hover:text-rose-300 hover:scale-125 transition-transform p-1 cursor-pointer focus:outline-none"
                          >
                            <X className="h-5 w-5 stroke-[2.5]" />
                          </button>
                          <div
                            role="tooltip"
                            className="pointer-events-none absolute top-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 z-50 rounded-lg border border-rose-500/35 bg-[#0D151D]/95 backdrop-blur-xl px-2.5 py-0.5 text-[10px] font-medium text-rose-200 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.6),0_0_12px_rgba(244,63,94,0.25)] transition-all duration-150 group-hover/cancel:translate-y-0 group-hover/cancel:opacity-100 -translate-y-1 whitespace-nowrap"
                          >
                            <span>Cancel</span>
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 border-l border-t border-rose-500/35 bg-[#0D151D]" />
                          </div>
                        </div>

                        {/* Correct Button: Confirm sync */}
                        <div className="group/sync relative inline-flex items-center justify-center">
                          <button
                            type="button"
                            disabled={calendarSyncing}
                            onClick={async () => {
                              if (!authSession) {
                                try {
                                  window.sessionStorage.setItem("examMate:pendingCalendarSync", "true");
                                  setGoogleLoading(true);
                                  const requireDrive = routineSourceRef.current === "drive";
                                  await startGoogleSignIn({ requireDrive });
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Could not start Google sign in.");
                                  setGoogleLoading(false);
                                }
                                return;
                              }
                              setShowCalendarSyncPrompt(false);
                              await syncCalendar(generatedExams);
                            }}
                            aria-label="Sync to Google Calendar"
                            className="flex items-center justify-center bg-transparent border-0 text-emerald-400 hover:text-emerald-300 hover:scale-125 transition-transform p-1 cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {calendarSyncing ? (
                              <LoaderCircle className="h-5 w-5 animate-spin text-emerald-300" />
                            ) : (
                              <Check className="h-5 w-5 stroke-[2.5]" />
                            )}
                          </button>
                          <div
                            role="tooltip"
                            className="pointer-events-none absolute top-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 z-50 rounded-lg border border-teal-400/35 bg-[#0D151D]/95 backdrop-blur-xl px-2.5 py-0.5 text-[10px] font-medium text-teal-200 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.6),0_0_12px_rgba(94,234,212,0.25)] transition-all duration-150 group-hover/sync:translate-y-0 group-hover/sync:opacity-100 -translate-y-1 whitespace-nowrap"
                          >
                            <span>Sync</span>
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 border-l border-t border-teal-400/35 bg-[#0D151D]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="print-footer">ExamMate</div>
            </>
          )}
        </LazySection>

        {/* FAQ SECTION */}
        <LazySection id="faq" className="content-auto-render order-6 w-full pt-8 flex flex-col gap-5" minHeight="360px">
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
        </main>

        {/* FOOTER */}
        <LazySection as="footer" className="content-auto-render order-7 w-full pt-4 flex flex-col gap-4" minHeight="150px">
          {/* Main Footer Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-teal-500/20 pb-4 text-center sm:text-left">
            {/* Left: ExamMate logo (using icon.svg) and short description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <img
                  src="/icon.svg"
                  alt="ExamMate Logo"
                  width="24"
                  height="24"
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
