"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import {
  formatDate,
  formatTime,
  normalizeCourseCode,
  coursesMatch,
  hasIncompleteTrailingDot,
  isFullCourseCode,
} from "@/lib/date";
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
  throw new Error(
    "Please upload an Excel spreadsheet file (.xlsx, .xls, .csv).",
  );
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
  return (exam.displayDate?.trim() || formatDate(exam.date)).replace(
    /(\d)\.(?=\d)/g,
    "$1/",
  );
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
  return (
    lower.endsWith("@seu.edu.bd") ||
    lower.endsWith(".edu.bd") ||
    lower.endsWith(".edu")
  );
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

async function startGoogleSignIn(options?: {
  requireDrive?: boolean;
  forceConsent?: boolean;
}) {
  const scopes = options?.requireDrive
    ? GOOGLE_DRIVE_SCOPES
    : GOOGLE_BASE_SCOPES;
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

async function startGoogleSignInPopup(options?: { requireDrive?: boolean }) {
  const scopes = options?.requireDrive
    ? GOOGLE_DRIVE_SCOPES
    : GOOGLE_BASE_SCOPES;
  return (authClient.signIn as any).popup({
    provider: "google",
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
        0,
      );
      const thumbHeight = maxScroll
        ? Math.min(
            trackHeight,
            Math.max(
              36,
              (trackHeight * window.innerHeight) /
                document.documentElement.scrollHeight,
            ),
          )
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
      travel,
    );
    window.scrollTo({
      top: (thumbOffset / travel) * scrollbar.maxScroll,
      behavior: "smooth",
    });
  };

  return (
    <div
      className="custom-scrollbar fixed right-0 top-2 z-[60] hidden md:flex h-[calc(100dvh-1rem)] w-3 justify-center"
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
          1,
        );
        const nextTop = Math.min(
          Math.max(
            dragRef.current.scrollTop +
              ((event.clientY - dragRef.current.pointerY) / thumbTravel) *
                scrollbar.maxScroll,
            0,
          ),
          scrollbar.maxScroll,
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
            (scrollbar.scrollTop / Math.max(scrollbar.maxScroll, 1)) * 100,
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
            if (event.key === "PageDown")
              window.scrollBy(0, window.innerHeight);
            if (event.key === "PageUp") window.scrollBy(0, -window.innerHeight);
            if (event.key === "Home") window.scrollTo(0, 0);
            if (event.key === "End")
              window.scrollTo(0, document.documentElement.scrollHeight);
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
  const [visibleRowCount, setVisibleRowCount] = useState<number>(0);
  const [isRevealingRows, setIsRevealingRows] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const rowRevealIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false);
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
  const hasDataToClear = Boolean(
    isTableGenerated ||
    allExams.length > 0 ||
    isFileUploaded ||
    isLinkActive ||
    courseInput.trim() ||
    courseDraft.trim() ||
    isSampleRoutine,
  );

  const isUploadDisabled = isLinkActive || uploading || isRealRoutineGenerated;
  const isLinkDisabled = isFileUploaded || isRealRoutineGenerated;
  const isCourseInputDisabled = isRealRoutineGenerated || !hasRoutineSource;

  const [recentLinks, setRecentLinks] = useState<string[]>([]);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [showCalendarSyncPrompt, setShowCalendarSyncPrompt] = useState(false);
  const [isSyncPromptClosing, setIsSyncPromptClosing] = useState(false);
  const syncPromptTimeoutRef = useRef<NodeJS.Timeout | number | null>(null);
  const [hasCalendarScope, setHasCalendarScope] = useState(false);
  const linkBoxRef = useRef<HTMLDivElement>(null);
  const linkPopupRef = useRef<HTMLDivElement>(null);
  const routineSourceRef = useRef<"excel" | "drive" | "sample">("excel");
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [tableScrollState, setTableScrollState] = useState({
    canLeft: false,
    canRight: false,
  });

  const updateTableScrollState = useCallback(() => {
    const el = tableWrapperRef.current;
    if (!el) {
      setTableScrollState({ canLeft: false, canRight: false });
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 2) {
      setTableScrollState({ canLeft: false, canRight: false });
      return;
    }
    setTableScrollState({
      canLeft: el.scrollLeft > 6,
      canRight: el.scrollLeft < maxScroll - 6,
    });
  }, []);

  useEffect(() => {
    const el = tableWrapperRef.current;
    if (!el) return;
    updateTableScrollState();
    const handleScroll = () => updateTableScrollState();
    el.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateTableScrollState);
    const observer = new ResizeObserver(() => updateTableScrollState());
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateTableScrollState);
      observer.disconnect();
    };
  }, [generatedExams, updateTableScrollState]);

  const handleTableMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;

    const el = tableWrapperRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 2) return;

    const startX = e.clientX;
    const startScrollLeft = el.scrollLeft;
    let isDragging = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      if (!isDragging && Math.abs(deltaX) > 3) {
        isDragging = true;
        document.body.style.userSelect = "none";
        el.style.cursor = "grabbing";
      }
      if (isDragging) {
        el.scrollLeft = startScrollLeft - deltaX;
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        document.body.style.userSelect = "";
        el.style.cursor = "";
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  function closeSyncPrompt(callback?: () => void) {
    if (isSyncPromptClosing) return;
    setIsSyncPromptClosing(true);
    window.setTimeout(() => {
      setShowCalendarSyncPrompt(false);
      setIsSyncPromptClosing(false);
      callback?.();
    }, 450);
  }

  useEffect(() => {
    if (!authSession) {
      setHasCalendarScope(false);
      return;
    }
    let isCancelled = false;
    void fetch("/api/calendar/sync")
      .then((res) => res.json())
      .then((data: { hasCalendarScope?: boolean }) => {
        if (
          !isCancelled &&
          data &&
          typeof data.hasCalendarScope === "boolean"
        ) {
          setHasCalendarScope(data.hasCalendarScope);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [authSession]);

  // Auto-dismiss the sync prompt after 20 seconds defaulting to no sync
  useEffect(() => {
    if (!showCalendarSyncPrompt || calendarSyncing || isSyncPromptClosing)
      return;
    const timer = window.setTimeout(() => {
      closeSyncPrompt();
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [showCalendarSyncPrompt, calendarSyncing, isSyncPromptClosing]);

  const selectedCourseCodes = useMemo(() => {
    return Array.from(
      new Set(
        courseInput
          .split(/[\n,]+/)
          .map((value) => value.trim().toUpperCase())
          .filter((value) => Boolean(value) && isFullCourseCode(value))
          .map((value) => normalizeCourseCode(value)),
      ),
    );
  }, [courseInput]);

  const hasEnteredCourse =
    selectedCourseCodes.length > 0 ||
    Boolean(
      courseDraft.trim() && isFullCourseCode(courseDraft.trim()),
    );

  const isGenerateDisabled =
    generating ||
    uploading ||
    isRealRoutineGenerated ||
    !hasRoutineSource ||
    !hasEnteredCourse;

  const generateDisabledReason = isRealRoutineGenerated
    ? "Routine table active. Click Clear My Data to reset."
    : !hasRoutineSource
      ? "Upload a routine file or paste Drive link."
      : !hasEnteredCourse
        ? "Enter at least one course code to generate."
        : "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const pendingCourses = window.sessionStorage.getItem(
        "examMate:pendingCourses",
      );
      if (pendingCourses) setCourseInput(pendingCourses);
      const pendingLink = window.sessionStorage.getItem(
        "examMate:pendingDriveLink",
      );
      if (pendingLink) setDriveLink(pendingLink);
      const savedSource = window.sessionStorage.getItem(
        "examMate:routineSource",
      );
      if (
        savedSource === "drive" ||
        savedSource === "excel" ||
        savedSource === "sample"
      ) {
        routineSourceRef.current = savedSource;
      }

      const raw = window.localStorage.getItem(ROUTINE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidStoredRoutine(parsed)) {
        window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
        return;
      }

      const expiresAt = new Date(parsed.expiresAt);
      if (
        Number.isNaN(expiresAt.getTime()) ||
        expiresAt.getTime() < Date.now()
      ) {
        window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
        return;
      }

      const validExams = sortExams(parsed.exams);
      if (!validExams.length) {
        window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
        return;
      }

      setGeneratedExams(validExams);
      setVisibleRowCount(validExams.length);
      setIsRevealingRows(false);
      setSavedNotice(
        `Routine restored (valid until ${formatDate(parsed.expiresAt.slice(0, 10))})`,
      );
    } catch {
      window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
    } finally {
      setIsHydrated(true);
    }

    return () => {
      if (rowRevealIntervalRef.current) {
        clearInterval(rowRevealIntervalRef.current);
      }
    };
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
      const pendingLink = window.sessionStorage.getItem(
        "examMate:pendingDriveLink",
      );
      const pendingCourses = window.sessionStorage.getItem(
        "examMate:pendingCourses",
      );
      if (pendingLink) {
        window.sessionStorage.removeItem("examMate:pendingDriveLink");
        window.sessionStorage.removeItem("examMate:pendingCourses");
        setDriveLink(pendingLink);
        if (pendingCourses) {
          setCourseInput(pendingCourses);
        }
        // Direct smooth scroll to the results table section immediately
        window.setTimeout(() => {
          const resultsEl = document.getElementById("results");
          if (resultsEl) {
            resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 100);
        window.setTimeout(() => {
          void handleGenerate(pendingLink, pendingCourses || undefined);
        }, 350);
        return;
      }
    } catch {
      // ignore storage errors
    }

    try {
      const justConnected = window.sessionStorage.getItem(
        "examMate:justConnectedGoogle",
      );
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
          const valid = parsed.filter(
            (item): item is string =>
              typeof item === "string" && Boolean(item.trim()),
          );
          setRecentLinks(valid.slice(0, 1));
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
    const updated = [trimmed];
    setRecentLinks(updated);
    try {
      window.localStorage.setItem(
        RECENT_DRIVE_LINKS_KEY,
        JSON.stringify(updated),
      );
    } catch {
      // ignore
    }
  }

  function removeRecentLink(linkToRemove: string) {
    setRecentLinks((prev) => {
      const updated = prev.filter((item) => item !== linkToRemove);
      try {
        window.localStorage.setItem(
          RECENT_DRIVE_LINKS_KEY,
          JSON.stringify(updated),
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
      setVisibleRowCount(0);
      setIsRevealingRows(false);
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
        setMessage("Drive link pasted.");
      } else {
        setError("Clipboard is empty.");
      }
    } catch {
      setError("Press Ctrl+V to paste.");
    }
  }

  async function syncCalendar(exams = generatedExams): Promise<boolean> {
    if (
      !exams.length ||
      isSampleRoutine ||
      routineSourceRef.current === "sample"
    )
      return false;
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
        result = JSON.parse(responseText) as {
          synced?: number;
          error?: string;
        };
      } catch {
        throw new Error(
          response.ok
            ? "The server returned an unreadable Calendar response. Please try again."
            : `Calendar sync failed (${response.status}). Please try again later.`,
        );
      }
      if (!response.ok) {
        if (response.status === 401) {
          setHasCalendarScope(false);
          setError(
            "Google session expired. Please click 'Connect Google' in navbar to sync.",
          );
          return false;
        }
        const err = new Error(
          result.error || "Could not sync Google Calendar.",
        );
        (err as any).status = response.status;
        throw err;
      }
      setHasCalendarScope(true);
      const count = result.synced ?? exams.length;
      setMessage(
        `${count} exam${count === 1 ? "" : "s"} synced to Google Calendar with reminders.`,
      );
      return true;
    } catch (syncError) {
      lastCalendarSyncRef.current = "";
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Calendar sync failed.",
      );
      return false;
    } finally {
      setCalendarSyncing(false);
    }
  }

  useEffect(() => {
    if (
      !authSession ||
      !generatedExams.length ||
      isSampleRoutine ||
      routineSourceRef.current === "sample"
    )
      return;
    const syncKey = JSON.stringify(generatedExams);
    try {
      const pendingSync = window.sessionStorage.getItem(
        "examMate:pendingCalendarSync",
      );
      if (pendingSync === "true") {
        window.sessionStorage.removeItem("examMate:pendingCalendarSync");
        setShowCalendarSyncPrompt(false);
        if (lastCalendarSyncRef.current !== syncKey) {
          lastCalendarSyncRef.current = syncKey;
          void syncCalendar(generatedExams);
        }
        return;
      }
    } catch {
      // ignore
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
      setError("Routine table active. Click 'Clear My Data' to reset.");
      return;
    }
    routineSourceRef.current = "excel";
    if (isSampleRoutine) {
      setIsSampleRoutine(false);
      setGeneratedExams([]);
      setVisibleRowCount(0);
      setIsRevealingRows(false);
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
          "No valid exams found. Check Course Code, Date & Time columns.",
        );
      }
      setAllExams(sortExams(parsed));
      setMessage(`${parsed.length} exams loaded successfully.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not parse routine file.",
      );
      setAllExams([]);
      setGeneratedExams([]);
      setVisibleRowCount(0);
      setIsRevealingRows(false);
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
      throw new Error(details.error || "Could not read Google Drive link.");
    }
    setRestrictedDriveFileId("");
    setRequiresGoogleAuth(false);
    const blob = await response.blob();
    const name = response.headers.get("X-File-Name") || "drive-routine.xlsx";
    const parsed = await parseRoutineFile(new File([blob], name));
    if (!parsed.length) {
      throw new Error(
        "No valid exams found. Check Course Code, Date & Time columns.",
      );
    }
    return sortExams(parsed);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (isRealRoutineGenerated) {
      setError("Routine table active. Click 'Clear My Data' to reset.");
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
      setError("Routine table active. Click 'Clear My Data' to reset.");
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

    rawTokens.forEach((token) => {
      const trimmed = token.trim().toUpperCase();
      if (!trimmed) return;
      if (isFullCourseCode(trimmed)) {
        validCodes.push(normalizeCourseCode(trimmed));
      }
    });

    if (validCodes.length) {
      const nextCodes = Array.from(
        new Set([...selectedCourseCodes, ...validCodes]),
      ).join(", ");
      setCourseInput(nextCodes);
      setError("");
    } else if (rawTokens.some((t) => t.trim())) {
      setError(
        "Incomplete course code! Please enter course code with section (e.g. CSE181.5).",
      );
    }
    setCourseDraft("");
  }

  function removeCourseCode(codeToRemove: string) {
    const nextCodes = selectedCourseCodes
      .filter((code) => code !== codeToRemove)
      .join(", ");
    setCourseInput(nextCodes);
  }

  async function handleGenerate(
    overrideLink?: string,
    overrideCourses?: string,
  ) {
    const rawLink = typeof overrideLink === "string" ? overrideLink : driveLink;
    const link = rawLink.trim();
    if (!link && !allExams.length) {
      setError("Upload a routine file or paste a Drive link.");
      return;
    }

    const effectiveCourseSource =
      typeof overrideCourses === "string" ? overrideCourses : courseInput;
    const pendingDraft = courseDraft.trim().toUpperCase();
    let effectiveSelectedCodes = Array.from(
      new Set(
        effectiveCourseSource
          .split(/[\n,]+/)
          .map((v) => v.trim().toUpperCase())
          .filter((v) => Boolean(v) && isFullCourseCode(v))
          .map((v) => normalizeCourseCode(v)),
      ),
    );

    if (pendingDraft && isFullCourseCode(pendingDraft)) {
      const normalized = normalizeCourseCode(pendingDraft);
      if (!effectiveSelectedCodes.includes(normalized)) {
        effectiveSelectedCodes = [...effectiveSelectedCodes, normalized];
        const nextText = effectiveSelectedCodes.join(", ");
        setCourseInput(nextText);
      }
    }
    setCourseDraft("");

    if (!effectiveSelectedCodes.length) {
      setError("Enter at least one course code.");
      return;
    }

    setGenerating(true);
    setError("");
    setMessage("");

    // Smoothly scroll down so user immediately sees the glowing loading skeleton table
    window.setTimeout(() => {
      const resultsEl = document.getElementById("results");
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);

    // If routine is already in memory (uploaded file or sample), provide a brief, futuristic scan pause
    if (!link) {
      await new Promise((resolve) => setTimeout(resolve, 360));
    }

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
            effectiveSelectedCodes.join(", "),
          );
          if (authSession?.user) {
            await authClient.signOut();
          }
          setGoogleLoading(true);
          setMessage("Connecting Google account");
          await startGoogleSignIn({ requireDrive: true });
          return;
        } catch (signInErr) {
          setError(
            signInErr instanceof Error
              ? signInErr.message
              : "Sign-in failed. Please connect Google from navbar.",
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
            : "Could not read Google Drive link.",
        );
        setGenerating(false);
        return;
      }
    }

    // Strictly match selected course codes (matching exact section when specified e.g. CSE181.5)
    const matchedExams: ParsedExam[] = [];
    for (const exam of sourceExams) {
      const matchedUserCode = effectiveSelectedCodes.find((code) =>
        coursesMatch(code, exam.courseCode),
      );
      if (matchedUserCode) {
        // If the user specified a section (e.g. CSE181.5) but the routine had no section (CSE181),
        // display the user's specific code in the table for clear identification
        const userHasSection = /\.\d+$/.test(matchedUserCode);
        const routineHasSection = /\.\d+$/.test(exam.courseCode);
        const finalCourseCode =
          userHasSection && !routineHasSection
            ? matchedUserCode
            : exam.courseCode;

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
      (code) =>
        !sourceExams.some((exam) => coursesMatch(code, exam.courseCode)),
    );

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
      setError(`No matches found for: ${unmatched.join(", ")}.`);
      setGenerating(false);
      setVisibleRowCount(0);
      setIsRevealingRows(false);
      return;
    }

    if (rowRevealIntervalRef.current) {
      clearInterval(rowRevealIntervalRef.current);
      rowRevealIntervalRef.current = null;
    }

    setGeneratedExams(matches);
    persistRoutine(matches);
    setGenerating(false);

    // Initial first row is revealed immediately
    setVisibleRowCount(1);
    setIsRevealingRows(matches.length > 1);

    // Ensure smoothly scrolled to table section
    window.setTimeout(() => {
      const resultsElement = document.getElementById("results");
      if (resultsElement) {
        resultsElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);

    const finishRoutineGeneration = () => {
      setIsRevealingRows(false);
      if (isSampleRoutine) {
        routineSourceRef.current = "sample";
        setShowCalendarSyncPrompt(false);
        setMessage(
          `${matches.length} exam${matches.length === 1 ? "" : "s"} generated (Sample Preview).`,
        );
        return;
      }

      if (link) {
        routineSourceRef.current = "drive";
        try {
          window.sessionStorage.setItem("examMate:routineSource", "drive");
        } catch {
          // ignore
        }
      } else {
        routineSourceRef.current = "excel";
      }

      const isConnected = Boolean(authSession?.user);
      const isVarsity = isConnected && isVarsityEmail(authSession?.user?.email);

      // Scenario A: Connected with Personal Google OR Varsity Google that already has Calendar permission:
      // -> Direct Auto-sync with connected Google Calendar! No popup prompt!
      if (isConnected && (!isVarsity || hasCalendarScope)) {
        setShowCalendarSyncPrompt(false);
        setIsSyncPromptClosing(false);
        if (syncPromptTimeoutRef.current) {
          clearTimeout(syncPromptTimeoutRef.current);
          syncPromptTimeoutRef.current = null;
        }

        setMessage(
          `${matches.length} exam${matches.length === 1 ? "" : "s"} generated.${
            unmatched.length ? ` Unmatched: ${unmatched.join(", ")}.` : ""
          } Auto-syncing to Google Calendar…`,
        );

        window.setTimeout(() => {
          void syncCalendar(matches);
        }, 500);
      } else if (isConnected && isVarsity && !hasCalendarScope) {
        // Scenario B: Connected with Varsity Google, but only Drive access was granted (no calendar permission):
        // Show in-table popup dialog asking if user wants to sync calendar.
        // Clicking Yes will open the Google consent popup to grant calendar permission, then sync!
        setShowCalendarSyncPrompt(false);
        setIsSyncPromptClosing(false);
        if (syncPromptTimeoutRef.current) {
          clearTimeout(syncPromptTimeoutRef.current);
        }
        syncPromptTimeoutRef.current = setTimeout(() => {
          setShowCalendarSyncPrompt(true);
          setIsSyncPromptClosing(false);
        }, 1200);

        setMessage(
          `${matches.length} exam${matches.length === 1 ? "" : "s"} generated.${
            unmatched.length ? ` Unmatched: ${unmatched.join(", ")}.` : ""
          }`,
        );
      } else {
        // Scenario C: Google is NOT connected at all:
        // No in-table popup dialog! Navbar Google Connect button remains ready and active for the user.
        setShowCalendarSyncPrompt(false);
        setIsSyncPromptClosing(false);
        if (syncPromptTimeoutRef.current) {
          clearTimeout(syncPromptTimeoutRef.current);
          syncPromptTimeoutRef.current = null;
        }

        setMessage(
          `${matches.length} exam${matches.length === 1 ? "" : "s"} generated.${
            unmatched.length ? ` Unmatched: ${unmatched.join(", ")}.` : ""
          }`,
        );
      }
    };

    if (matches.length > 1) {
      const stepInterval =
        matches.length <= 4
          ? 220
          : matches.length <= 8
            ? 180
            : Math.max(90, Math.floor(1600 / matches.length));

      let currentRow = 1;
      rowRevealIntervalRef.current = setInterval(() => {
        currentRow += 1;
        setVisibleRowCount(currentRow);

        if (currentRow >= matches.length) {
          if (rowRevealIntervalRef.current) {
            clearInterval(rowRevealIntervalRef.current);
            rowRevealIntervalRef.current = null;
          }
          finishRoutineGeneration();
        }
      }, stepInterval);
    } else {
      finishRoutineGeneration();
    }
  }

  function handleLoadSample() {
    if (generatedExams.length > 0) {
      setError("Routine table active. Click 'Clear My Data' to reset.");
      return;
    }
    routineSourceRef.current = "sample";
    lastCalendarSyncRef.current = "";
    if (syncPromptTimeoutRef.current) {
      clearTimeout(syncPromptTimeoutRef.current);
      syncPromptTimeoutRef.current = null;
    }
    setIsSyncPromptClosing(false);
    setShowCalendarSyncPrompt(false);
    setIsSampleRoutine(true);
    setGeneratedExams([]);
    setVisibleRowCount(0);
    setIsRevealingRows(false);
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
    setMessage("Sample routine loaded.");
  }

  function clearSavedRoutine() {
    const hasStoredRoutine =
      typeof window !== "undefined" &&
      Boolean(window.localStorage.getItem(ROUTINE_STORAGE_KEY));
    if (!hasDataToClear && !hasStoredRoutine) {
      return;
    }

    lastCalendarSyncRef.current = "";
    if (syncPromptTimeoutRef.current) {
      clearTimeout(syncPromptTimeoutRef.current);
      syncPromptTimeoutRef.current = null;
    }
    if (rowRevealIntervalRef.current) {
      clearInterval(rowRevealIntervalRef.current);
      rowRevealIntervalRef.current = null;
    }
    setIsSyncPromptClosing(false);
    setShowCalendarSyncPrompt(false);
    setIsSampleRoutine(false);
    setGeneratedExams([]);
    setVisibleRowCount(0);
    setIsRevealingRows(false);
    setCourseInput("");
    setCourseDraft("");
    setFileName("");
    setDriveLink("");
    setShowLinkPopup(false);
    setAllExams([]);
    setRestrictedDriveFileId("");
    setRequiresGoogleAuth(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    routineSourceRef.current = "excel";
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
        window.localStorage.removeItem("examMate:routine:v1");
        window.localStorage.removeItem("examMate:savedDriveLink");
        window.sessionStorage.removeItem("examMate:routineSource");
        window.sessionStorage.removeItem("examMate:pendingDriveLink");
        window.sessionStorage.removeItem("examMate:pendingCourses");
        window.sessionStorage.removeItem("examMate:pendingCalendarSync");
        window.sessionStorage.removeItem("examMate:justConnectedGoogle");
      }
    } catch {
      // ignore
    }
    setSavedNotice("");
    setMessage("Routine data and browser cache cleared.");
  }

  async function handleGoogleConnect() {
    if (isSampleRoutine) {
      setError("Google sync is disabled for sample routines.");
      return;
    }
    if (!isRealRoutineGenerated && !isLinkActive) {
      setError("Please generate a routine before connecting Google.");
      return;
    }
    if (driveLink.trim()) {
      try {
        window.sessionStorage.setItem(
          "examMate:pendingDriveLink",
          driveLink.trim(),
        );
        if (selectedCourseCodes.length) {
          window.sessionStorage.setItem(
            "examMate:pendingCourses",
            selectedCourseCodes.join(", "),
          );
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
      const requireDrive = Boolean(
        isLinkActive || routineSourceRef.current === "drive",
      );
      const result = await startGoogleSignIn({ requireDrive });
      if (result?.error) {
        throw new Error(result.error.message || "Google sign-in failed.");
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
          : "Google sign-in failed.",
      );
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGoogleDisconnect() {
    setGoogleDisconnecting(true);
    setGoogleLoading(true);
    setError("");
    try {
      const disconnectResponse = await fetch("/api/calendar/disconnect", {
        method: "POST",
      });
      const disconnectText = await disconnectResponse.text();
      let disconnectResult: { disconnected?: boolean; error?: string };
      try {
        disconnectResult = JSON.parse(disconnectText) as {
          disconnected?: boolean;
          error?: string;
        };
      } catch {
        throw new Error("Google disconnect failed. Invalid server response.");
      }
      if (!disconnectResponse.ok) {
        throw new Error(disconnectResult.error || "Google disconnect failed.");
      }
      const result = await authClient.signOut();
      if (result?.error)
        throw new Error(result.error.message || "Google disconnect failed.");
      lastCalendarSyncRef.current = "";
      setMessage("Google disconnected. Calendar events kept.");
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Google disconnect failed.",
      );
    } finally {
      setGoogleDisconnecting(false);
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
      head: [["Date", "Day", "Time", "Course", "Course Title", "Faculty"]],
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
      setError("Generate your routine before exporting PDF.");
      return;
    }
    const doc = await buildPdfDocument();
    doc.save("ExamMate-Schedule.pdf");
  }

  async function printPdf() {
    if (!generatedExams.length) {
      setError("Generate your routine before printing PDF.");
      return;
    }
    try {
      const doc = await buildPdfDocument();
      doc.autoPrint();
      const pdfBlob = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Open exact styled PDF in print preview window
      const printWin = window.open(pdfUrl, "_blank");
      if (printWin) {
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
      } else {
        // Fallback for popup blocker: use invisible iframe
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch {
              window.print();
            } finally {
              setTimeout(() => {
                iframe.remove();
                URL.revokeObjectURL(pdfUrl);
              }, 60000);
            }
          }, 250);
        };
      }
    } catch {
      window.print();
    }
  }

  function fallbackExportPng() {
    const scale = 2;
    const width = 1100;
    const paddingX = 40;
    const headerHeight = 110;
    const rowHeight = 44;
    const footerHeight = 50;
    const tableTop = headerHeight;
    const totalHeight =
      headerHeight + (generatedExams.length + 1) * rowHeight + footerHeight;

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
      { header: "Course Title", width: tableWidth * 0.3 },
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

        ctx.font =
          c === 3
            ? "bold 12px 'DM Mono', monospace"
            : "12px 'Inter', sans-serif";
        ctx.fillStyle = c === 3 ? "#0e7468" : "#263432";

        const maxTextWidth = colDef.width - 24;
        let textToDraw = val;
        if (ctx.measureText(textToDraw).width > maxTextWidth) {
          while (
            textToDraw.length > 0 &&
            ctx.measureText(textToDraw + "...").width > maxTextWidth
          ) {
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
    ctx.strokeRect(
      paddingX,
      tableTop,
      tableWidth,
      (rows.length + 1) * rowHeight,
    );

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
      setError("Generate your routine before exporting PNG.");
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

  const faqItems: { question: string; answer: React.ReactNode }[] = [
    {
      question: "Can I use ExamMate without an account?",
      answer:
        "Yes. You can upload your routine file, enter your course codes, and generate your personal exam schedule immediately without signing in or creating an account.",
    },
    {
      question: "How does the Google Drive link import work & what permissions are requested?",
      answer: (
        <span className="space-y-2 block">
          <span>
            Paste your shared Google Drive or Sheets link in Option 2. If the routine spreadsheet requires institutional authorization (@seu.edu.bd), clicking Generate will prompt a secure Google sign-in requesting read-only access (<code className="text-teal-300 bg-teal-950/60 px-1 py-0.5 rounded border border-teal-500/20 text-[11px]">drive.readonly</code>) strictly to download that specific routine file.
          </span>
          <span className="block text-slate-400">
            ExamMate accesses only the specific target file ID provided in the link. It never searches, browses, edits, or deletes any other files in your Google Drive, and the routine is parsed directly in browser memory with zero server storage.
          </span>
        </span>
      ),
    },
    {
      question: "Which file formats can I upload?",
      answer:
        "Excel files (.xlsx, .xls, .xlsm, .csv) and Google Drive links are fully supported. The parser automatically detects exam dates, shift times, course codes, titles, and faculty details.",
    },
    {
      question: "Can I sync my schedule to Google Calendar?",
      answer: (
        <span className="space-y-2 block">
          <span>
            Yes. Connecting Google Calendar is completely optional. When you choose to sync your routine, ExamMate requests calendar event permission (<code className="text-teal-300 bg-teal-950/60 px-1 py-0.5 rounded border border-teal-500/20 text-[11px]">calendar.events</code>) solely to add your matched exam dates, shift times, and reminders directly to your primary calendar.
          </span>
          <span className="block text-slate-400">
            ExamMate only creates new exam events for the courses you selected; it never reads, alters, or deletes any of your existing personal calendar events.
          </span>
        </span>
      ),
    },
    {
      question: "How does ExamMate protect my data & Google user data?",
      answer: (
        <span className="space-y-2 block">
          <span>
            Your routine is processed client-side in your browser and never stored on our servers. Generated schedules are saved locally on your device for 15 days for quick access and automatically expire afterwards.
          </span>
          <span className="block text-slate-300">
            ExamMate&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-300 underline underline-offset-4 hover:text-teal-100 font-medium"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We never sell user data to third parties, nor do we use Google user data to train AI models. You can revoke access at any time via{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-300 underline underline-offset-4 hover:text-teal-100 font-medium"
            >
              Google Account Security Settings
            </a>
            . For full details, see our{" "}
            <Link
              href="/privacy"
              className="text-teal-300 underline underline-offset-4 hover:text-teal-100 font-medium"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </span>
      ),
    },
  ];

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden text-[#E2E8F0] relative flex flex-col items-center justify-start selection:bg-teal-500/30 selection:text-teal-200">
      {/* Background Ambience Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[8%] right-[12%] w-[38rem] h-[38rem] bg-teal-500/10 rounded-full blur-[140px]" />
        <div className="absolute top-[45%] left-[5%] w-[32rem] h-[32rem] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[20%] w-[40rem] h-[30rem] bg-cyan-500/5 rounded-full blur-[140px]" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[1240px] px-3 pt-3 pb-16 flex flex-col gap-8 sm:px-6 sm:pt-4 sm:pb-20 sm:gap-10 lg:px-8 min-w-0">
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
            {!authSession &&
              !isSampleRoutine &&
              (isRealRoutineGenerated || isLinkActive) && (
                <Send
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1.5 -top-2.5 z-10 h-4 w-4 rotate-[-10deg] fill-[#5EEAD4] text-[#5EEAD4] drop-shadow-[0_0_7px_rgba(94,234,212,0.8)] sm:-right-2 sm:-top-3 sm:h-5 sm:w-5"
                />
              )}
            <button
              type="button"
              onClick={
                authSession ? handleGoogleDisconnect : handleGoogleConnect
              }
              disabled={
                googleLoading ||
                calendarSyncing ||
                isSampleRoutine ||
                (!authSession && !isRealRoutineGenerated && !isLinkActive)
              }
              aria-label={
                isSampleRoutine
                  ? "Google sync is disabled for sample routines."
                  : authSession
                    ? "Disconnect Google. Synced events will remain in Google Calendar."
                    : isRealRoutineGenerated || isLinkActive
                      ? "Connect Google and sync this routine"
                      : "Generate a routine before connecting Google"
              }
              className={`google-connect-button group ${
                authSession
                  ? `google-connect-button--connected ${
                      isSampleRoutine ? "opacity-50 cursor-not-allowed" : ""
                    }`
                  : isSampleRoutine
                    ? "google-connect-button--disabled google-connect-button--connect opacity-40 cursor-not-allowed"
                    : isRealRoutineGenerated || isLinkActive
                      ? "google-connect-button--ready google-connect-button--connect"
                      : "google-connect-button--disabled google-connect-button--connect opacity-50 cursor-not-allowed"
              } ${googleLoading || calendarSyncing ? "google-connect-button--loading" : ""}`}
            >
              {googleLoading || calendarSyncing ? (
                <svg
                  aria-hidden="true"
                  className="google-official-spinner shrink-0"
                  viewBox="0 0 50 50"
                >
                  <circle
                    className="google-official-spinner-path"
                    cx="25"
                    cy="25"
                    r="20"
                    fill="none"
                    strokeWidth="4.5"
                  />
                </svg>
              ) : (
                <img
                  src="/google-logo.png"
                  alt=""
                  aria-hidden="true"
                  width="19"
                  height="19"
                  className="google-connect-logo shrink-0"
                />
              )}
              <span
                className={`google-connect-label text-[11px] sm:text-[13px] font-medium tracking-normal ${
                  authSession ? "pointer-events-none" : ""
                }`}
              >
                {calendarSyncing
                  ? "Syncing..."
                  : googleDisconnecting
                    ? "Disconnecting..."
                    : googleLoading && !authSession
                      ? "Connecting..."
                      : "Connect Google"}
              </span>
            </button>
            <div
              role="tooltip"
              className="pointer-events-none absolute right-0 top-[calc(100%+0.65rem)] z-50 w-max max-w-[min(20rem,calc(100vw-2rem))] translate-y-1 rounded-xl border border-teal-400/35 bg-[#0A1822]/95 px-3.5 py-2 text-xs backdrop-blur-xl opacity-0 shadow-[0_12px_30px_rgba(0,0,0,0.65),0_0_15px_rgba(94,234,212,0.18)] transition-all duration-200 group-hover/google:translate-y-0 group-hover/google:opacity-100 group-focus-within/google:translate-y-0 group-focus-within/google:opacity-100"
            >
              <div className="flex items-center gap-1.5 font-medium">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isSampleRoutine
                      ? "bg-slate-400"
                      : authSession
                        ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                        : "bg-teal-400 shadow-[0_0_6px_rgba(94,234,212,0.8)]"
                  }`}
                />
                <span className="truncate max-w-[17rem] text-teal-100 font-semibold tracking-tight">
                  {isSampleRoutine
                    ? "Sample Preview Mode"
                    : authSession
                      ? authSession.user?.email || "Google Connected"
                      : isLinkActive
                        ? "Varsity Google Account"
                        : isRealRoutineGenerated
                          ? "Google Calendar Sync"
                          : "Connect Google"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-teal-200/70">
                {isSampleRoutine
                  ? "Google sync is disabled for sample routines."
                  : authSession
                    ? "Click to disconnect account."
                    : isLinkActive
                      ? "Connect @seu.edu.bd to read Drive routine."
                      : isRealRoutineGenerated
                        ? "Connect to sync exams and set reminders."
                        : "Generate routine to enable calendar sync."}
              </p>
              <div className="absolute -top-1 right-5 w-2 h-2 rotate-45 border-l border-t border-teal-400/35 bg-[#0A1822]" />
            </div>
          </div>
        </header>

        <main id="main-content" className="contents">
          {/* HERO SECTION */}
          <LazySection
            className="order-2 relative w-full pt-2 lg:pt-4 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start min-w-0"
            minHeight="460px"
          >
            {/* Left Side: Headline, Subheadline, Buttons */}
            <div className="lg:col-span-7 flex flex-col items-start gap-5 min-w-0">
              <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-black uppercase tracking-tight text-white leading-[1.08] break-words">
                BUILD YOUR EXAM
                <br />
                TABLE <span className="text-neon-mint">IN MINUTES</span>
              </h1>

              <p className="text-sm sm:text-base text-[#94A3B8] max-w-lg leading-relaxed font-normal">
                Find your exact exam dates and times from the official
                university routine. Export a clean schedule or sync with Google
                Calendar in seconds.
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
            <div className="lg:col-span-5 flex flex-col items-center justify-center gap-6 relative w-full max-w-full overflow-hidden py-3 sm:py-6 min-w-0">
              {/* 3D Isometric Scene */}
              <div className="iso-scene relative w-full max-w-[min(380px,100%)] h-[220px] flex items-center justify-center">
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
                    <span className="text-[8px] text-teal-400/80">
                      FALL SEMESTER
                    </span>
                  </div>

                  {/* Inner Calendar Grid */}
                  <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                    <div className="h-9 rounded-md bg-emerald-500/20 border border-emerald-400/40 p-1 flex flex-col justify-between">
                      <span className="text-[6px] text-emerald-300">
                        10:00 AM
                      </span>
                      <span className="text-[8px] font-bold text-white">
                        CSE101
                      </span>
                    </div>
                    <div className="h-9 rounded-md bg-pink-500/20 border border-pink-400/40 p-1 flex flex-col justify-between">
                      <span className="text-[6px] text-pink-300">02:00 PM</span>
                      <span className="text-[8px] font-bold text-white">
                        MAT101
                      </span>
                    </div>
                    <div className="h-9 rounded-md bg-purple-500/20 border border-purple-400/40 p-1 flex flex-col justify-between">
                      <span className="text-[6px] text-purple-300">
                        10:00 AM
                      </span>
                      <span className="text-[8px] font-bold text-white">
                        CSE102
                      </span>
                    </div>
                    <div className="h-9 rounded-md bg-teal-500/20 border border-teal-400/40 p-1 flex flex-col justify-between">
                      <span className="text-[6px] text-teal-300">02:00 PM</span>
                      <span className="text-[8px] font-bold text-white">
                        PHY101
                      </span>
                    </div>

                    <div className="h-9 rounded-md bg-teal-900/30 border border-teal-500/20 p-1" />
                    <div className="h-9 rounded-md bg-emerald-500/30 border border-emerald-400/50 p-1 flex flex-col justify-between">
                      <span className="text-[6px] text-emerald-300">
                        10:00 AM
                      </span>
                      <span className="text-[8px] font-bold text-white">
                        ENG101
                      </span>
                    </div>
                    <div className="h-9 rounded-md bg-teal-900/30 border border-teal-500/20 p-1" />
                    <div className="h-9 rounded-md bg-purple-500/20 border border-purple-400/40 p-1 flex flex-col justify-between">
                      <span className="text-[6px] text-purple-300">
                        02:00 PM
                      </span>
                      <span className="text-[8px] font-bold text-white">
                        GED101
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </LazySection>

          {/* MAIN DASHBOARD */}
          <LazySection
            id="generator"
            className="order-4 w-full pt-6 min-w-0 max-w-full"
            minHeight="620px"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch min-w-0">
              {/* Left part of container */}
              <div className="lg:col-span-8 glass-panel glass-panel--static rounded-2xl p-4 sm:p-6 flex flex-col justify-between gap-5 border border-teal-500/35 shadow-[0_16px_40px_rgba(0,0,0,0.6)] min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-teal-500/20 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono-code text-xs text-teal-300">
                      01 /
                    </span>
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
                            "Routine table active. Click 'Clear My Data' to reset.",
                          );
                          return;
                        }
                        if (isUploadDisabled) return;
                        handleDrop(e);
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                      className={`group/drop relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed text-center transition-all duration-200 ${
                        isUploadDisabled
                          ? "opacity-35 cursor-not-allowed border-slate-700 bg-slate-950/40 pointer-events-none"
                          : isDragOver
                            ? "border-emerald-400 bg-emerald-950/40 cursor-pointer shadow-[0_0_24px_rgba(52,211,153,0.25)]"
                            : "border-teal-400/40 bg-teal-950/20 cursor-pointer hover:border-teal-300/80 hover:bg-teal-950/40 hover:shadow-[0_0_28px_rgba(94,234,212,0.14),inset_0_0_20px_rgba(94,234,212,0.04)]"
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
                      <div className="w-10 h-10 rounded-full bg-teal-500/10 border border-teal-400/30 flex items-center justify-center text-[#5EEAD4] shadow-[0_0_15px_rgba(94,234,212,0.18)] transition-all duration-200 group-hover/drop:border-teal-300 group-hover/drop:bg-teal-500/25 group-hover/drop:shadow-[0_0_22px_rgba(94,234,212,0.35)]">
                        {uploading && !isLinkActive ? (
                          <LoaderCircle className="w-5 h-5 animate-spin" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                      </div>
                      <span
                        className={`text-xs font-semibold text-white px-2 transition-colors duration-200 group-hover/drop:text-teal-100 ${isFileUploaded ? "max-w-full truncate" : "max-w-none text-center"}`}
                      >
                        {isRealRoutineGenerated
                          ? "Upload disabled (routine table generated) — clear data to upload"
                          : isLinkActive
                            ? "Upload disabled (Drive link is active below)"
                            : isFileUploaded
                              ? fileName
                              : "Choose an exam routine file (Excel .xlsx / .xls / .csv)"}
                      </span>
                      {isFileUploaded &&
                      !isLinkActive &&
                      !isRealRoutineGenerated ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearUploadedFile();
                          }}
                          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-rose-500/40 bg-rose-500/15 text-xs font-mono-code text-rose-300 hover:bg-rose-500/25 hover:text-rose-100 transition-colors shadow-sm pointer-events-auto"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove file
                        </button>
                      ) : (
                        <span
                          className="mt-1 flex items-center gap-2"
                          aria-hidden="true"
                        >
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200 transition-colors duration-200 group-hover/drop:border-emerald-400/40">
                            <FileSpreadsheet className="h-3 w-3" /> Excel (.xlsx
                            / .xls / .csv)
                          </span>
                        </span>
                      )}
                    </label>
                    {!isRealRoutineGenerated && isLinkActive ? (
                      <p className="text-[10px] text-amber-300/80 font-mono-code">
                        * Upload is disabled because a Drive link is entered.
                        Clear the link below to upload a file instead.
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
                            const input = document.getElementById(
                              "drive-link",
                            ) as HTMLInputElement | null;
                            input?.focus();
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!isLinkDisabled) {
                            setShowLinkPopup(true);
                            const input = document.getElementById(
                              "drive-link",
                            ) as HTMLInputElement | null;
                            input?.focus();
                          }
                        }}
                        className={`relative flex min-h-11 items-center gap-2 rounded-xl border px-3 transition-all duration-300 select-none ${
                          isLinkDisabled
                            ? "opacity-35 cursor-not-allowed border-slate-700 bg-slate-950/40 pointer-events-none"
                            : isLinkActive
                              ? "border-teal-500/30 bg-[#0A1620]/80 focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-400 focus-within:shadow-[0_0_20px_rgba(94,234,212,0.2)]"
                              : "border-teal-400/50 bg-teal-950/25 cursor-pointer hover:border-teal-300 hover:bg-teal-950/40 hover:shadow-[0_0_20px_rgba(94,234,212,0.12)] focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-400 focus-within:shadow-[0_0_20px_rgba(94,234,212,0.2)]"
                        }`}
                      >
                        <Link2
                          className="h-4 w-4 shrink-0 text-teal-300"
                          aria-hidden="true"
                        />
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
                                "Routine table active. Click 'Clear My Data' to reset.",
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
                        {isLinkActive &&
                          !isFileUploaded &&
                          !isRealRoutineGenerated && (
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
                          className="absolute left-1 sm:left-3 top-[calc(100%+6px)] z-50 w-auto min-w-[180px] max-w-[min(280px,calc(100vw-3.5rem))] rounded-lg border border-teal-500/40 bg-[#0B1520]/95 backdrop-blur-md p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.65),0_0_15px_rgba(94,234,212,0.15)] animate-in fade-in zoom-in-95 duration-100"
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
                            <span className="font-mono-code text-[9px] text-teal-400/70">
                              Ctrl+V
                            </span>
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
                              {recentLinks.slice(0, 1).map((link) => (
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
                        * Drive link is disabled because an Excel file is
                        already uploaded ({fileName}). Click &quot;Remove
                        file&quot; above to use a link instead.
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
                      className={`ml-1 font-medium transition-colors duration-200 ${
                        generatedExams.length > 0
                          ? "text-slate-600 cursor-not-allowed no-underline opacity-50"
                          : "text-teal-300 underline decoration-teal-300/40 underline-offset-4 hover:text-teal-100 hover:decoration-teal-200 cursor-pointer"
                      }`}
                    >
                      Try a sample routine
                    </button>
                  </div>
                </div>

                {/* Removable course-code chips and entry field */}
                <div
                  className={`flex flex-col gap-1.5 ${isCourseInputDisabled ? "cursor-not-allowed" : ""}`}
                >
                  <label
                    htmlFor="course-codes"
                    className="text-[10px] font-mono-code uppercase tracking-wider text-teal-400/80 font-semibold"
                  >
                    COURSE CODES
                  </label>
                  <div
                    onContextMenu={(e) => e.preventDefault()}
                    className={`flex min-h-12 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200 ${
                      isCourseInputDisabled
                        ? "opacity-40 cursor-not-allowed border-slate-700 bg-slate-950/40 pointer-events-none"
                        : "glass-card border-teal-500/30 bg-[#0A1620]/80 focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-400 focus-within:shadow-[0_0_20px_rgba(94,234,212,0.2)]"
                    }`}
                  >
                    {selectedCourseCodes.map((code) => (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1 rounded-full border border-teal-500/35 bg-teal-500/15 px-2.5 py-1 font-mono-code text-[11px] text-teal-200 transition-colors duration-200 hover:border-teal-400/60 hover:bg-teal-500/25"
                      >
                        {code}
                        {!isCourseInputDisabled && (
                          <button
                            type="button"
                            onClick={() => removeCourseCode(code)}
                            aria-label={`Remove ${code}`}
                            className="rounded-full p-0.5 text-teal-200/70 transition-colors duration-150 hover:bg-rose-500/20 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
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
                          if (!trimmed) return;

                          if (!isFullCourseCode(trimmed)) {
                            setCourseDraft("");
                            setError(
                              "Incomplete course code! Please enter course code with section (e.g. CSE181.5).",
                            );
                            return;
                          }

                          setError("");
                          addCourseCodes(`${trimmed},`);
                        } else if (
                          event.key === "Backspace" &&
                          !courseDraft &&
                          selectedCourseCodes.length
                        ) {
                          removeCourseCode(
                            selectedCourseCodes[
                              selectedCourseCodes.length - 1
                            ] ?? "",
                          );
                        }
                      }}
                      onBlur={() => {
                        if (isCourseInputDisabled) return;
                        const trimmed = courseDraft.trim().toUpperCase();
                        if (trimmed) {
                          if (isFullCourseCode(trimmed)) {
                            addCourseCodes(`${trimmed},`);
                          } else {
                            setCourseDraft("");
                          }
                        }
                      }}
                      placeholder={
                        isRealRoutineGenerated
                          ? "Locked (routine table generated) — click Clear My Data"
                          : !hasRoutineSource
                            ? "Upload routine file or paste Drive link first…"
                            : "Add course code (e.g. CSE181.5)…"
                      }
                      className="min-w-[120px] sm:min-w-[150px] flex-1 border-0 bg-transparent px-1 py-1 text-sm font-mono-code uppercase text-white placeholder:text-slate-500 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
                      aria-describedby="course-codes-hint"
                    />
                  </div>
                  {!hasRoutineSource ? (
                    <p
                      id="course-codes-hint"
                      className="text-[11px] text-slate-400"
                    >
                      Upload an Excel routine file or paste a Google Drive link
                      above to unlock course codes.
                    </p>
                  ) : hasIncompleteTrailingDot(courseDraft) ? (
                    <p
                      id="course-codes-hint"
                      className="text-[11px] text-amber-300 font-medium flex items-center gap-1"
                    >
                      <span>
                        Enter section number after dot (e.g. .5), then press Enter.
                      </span>
                    </p>
                  ) : courseDraft.trim() && !isFullCourseCode(courseDraft) ? (
                    <p
                      id="course-codes-hint"
                      className="text-[11px] text-amber-300 font-medium flex items-center gap-1"
                    >
                      <span>
                        Enter course code with section (e.g. CSE181.5), then press Enter.
                      </span>
                    </p>
                  ) : (
                    <p
                      id="course-codes-hint"
                      className="text-[11px] text-[#94A3B8]"
                    >
                      Press Enter or use a comma to add each course (e.g.
                      CSE181.5).
                    </p>
                  )}
                </div>

                {/* Glowing "Generate" button and "Clear My Data" ghost button */}
                <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-4 border-t border-teal-500/15">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div
                      className={`group/gen relative inline-flex ${isGenerateDisabled ? "cursor-not-allowed" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => void handleGenerate()}
                        disabled={isGenerateDisabled}
                        aria-label="Generate personal exam table"
                        className={`relative overflow-hidden inline-flex items-center justify-center rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          generating
                            ? "w-[5.5rem] sm:w-[6rem] px-0 py-2.5 bg-gradient-to-r from-[#5EEAD4] via-[#A7F3D0] to-[#5EEAD4] text-[#031A15] shadow-[0_0_35px_rgba(94,234,212,0.7)] ring-2 ring-teal-300 cursor-wait"
                            : "min-w-[130px] px-7 py-2.5 gap-2.5 btn-neon-primary disabled:opacity-40 disabled:pointer-events-none shadow-[0_0_20px_rgba(94,234,212,0.35)]"
                        }`}
                      >
                        {generating && (
                          /* Shimmer streak passing across button */
                          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shimmer" />
                        )}
                        {generating ? (
                          <div
                            aria-hidden="true"
                            className="celestial-sparkle-container"
                          >
                            <span className="celestial-aura absolute w-6 h-6 rounded-full bg-teal-950/40 blur-[2px] pointer-events-none" />
                            <svg
                              viewBox="0 0 24 24"
                              className="celestial-stardust-tr absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-[#031A15] fill-current"
                            >
                              <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" />
                            </svg>
                            <svg
                              viewBox="0 0 24 24"
                              className="celestial-stardust-bl absolute -bottom-0.5 -left-0.5 w-2 h-2 text-[#031A15] fill-current"
                            >
                              <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" />
                            </svg>
                            <div className="celestial-core-rotator">
                              <svg
                                viewBox="0 0 24 24"
                                className="celestial-star-core w-5 h-5 text-[#031A15] fill-current"
                              >
                                <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2L12 0Z" />
                              </svg>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-[#041B16] shrink-0" />
                            <span className="font-extrabold tracking-wider whitespace-nowrap">
                              Generate
                            </span>
                          </>
                        )}
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

                    <div className="group/clear relative inline-flex items-center">
                      <button
                        type="button"
                        onClick={clearSavedRoutine}
                        disabled={!hasDataToClear}
                        aria-label={
                          !hasDataToClear
                            ? "No routine data to clear"
                            : "Clear all routine data"
                        }
                        className="btn-ghost-glass inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-mono-code disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none disabled:hover:border-teal-500/20 disabled:hover:bg-transparent transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-teal-400/70" />
                        <span>Clear My Data</span>
                      </button>

                      {/* Custom Glassmorphic Tooltip */}
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute bottom-[calc(100%+0.65rem)] left-1/2 -translate-x-1/2 z-50 w-max max-w-[min(20rem,calc(100vw-2.5rem))] translate-y-1 rounded-xl border border-teal-400/35 bg-[#0A1822]/95 backdrop-blur-xl px-3.5 py-1.5 text-xs font-medium text-teal-100 opacity-0 shadow-[0_12px_30px_rgba(0,0,0,0.65),0_0_15px_rgba(94,234,212,0.18)] transition-all duration-200 group-hover/clear:translate-y-0 group-hover/clear:opacity-100 whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              !hasDataToClear
                                ? "bg-teal-400/70 shadow-[0_0_6px_rgba(94,234,212,0.6)]"
                                : "bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]"
                            }`}
                          />
                          <span>
                            {!hasDataToClear
                              ? "No routine data to clear"
                              : "Clear all routine data"}
                          </span>
                        </div>
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b border-teal-400/35 bg-[#0A1822]" />
                      </div>
                    </div>
                  </div>

                  {fileName && (
                    <span className="text-[11px] font-mono-code text-teal-300/70 truncate max-w-full sm:max-w-[200px]">
                      {fileName}
                    </span>
                  )}
                </div>
              </div>

              {/* Right part of container: Three feature glass cards (Time, Privacy, Calendar) */}
              <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-3 lg:flex lg:flex-col gap-3 lg:justify-center min-w-0">
                {/* Card 1: Accurate Timetable */}
                <div className="group flex flex-1 flex-col justify-center gap-1.5 rounded-2xl glass-panel border border-teal-500/25 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-teal-400/60 hover:bg-[#0c1f2b]/80 hover:shadow-[0_12px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(94,234,212,0.12)] sm:p-5 cursor-default">
                  <div className="flex items-center gap-2.5 text-white font-semibold text-sm transition-colors duration-200 group-hover:text-teal-200">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-[#5EEAD4] transition-all duration-200 group-hover:bg-teal-400/20 group-hover:border-teal-300/50 group-hover:text-teal-200 group-hover:shadow-[0_0_14px_rgba(94,234,212,0.3)]">
                      <Clock3 className="w-3.5 h-3.5" />
                    </div>
                    <span>Accurate Timetable</span>
                  </div>
                  <p className="text-xs text-[#94A3B8] leading-relaxed transition-colors duration-200 group-hover:text-slate-200">
                    Exam dates, shift times, and faculty info are normalized into
                    a clear, chronological schedule.
                  </p>
                </div>

                {/* Card 2: Client-Side Privacy */}
                <div className="group flex flex-1 flex-col justify-center gap-1.5 rounded-2xl glass-panel border border-teal-500/25 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-teal-400/60 hover:bg-[#0c1f2b]/80 hover:shadow-[0_12px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(94,234,212,0.12)] sm:p-5 cursor-default">
                  <div className="flex items-center gap-2.5 text-white font-semibold text-sm transition-colors duration-200 group-hover:text-teal-200">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-[#5EEAD4] transition-all duration-200 group-hover:bg-teal-400/20 group-hover:border-teal-300/50 group-hover:text-teal-200 group-hover:shadow-[0_0_14px_rgba(94,234,212,0.3)]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <span>Client-Side Privacy</span>
                  </div>
                  <p className="text-xs text-[#94A3B8] leading-relaxed transition-colors duration-200 group-hover:text-slate-200">
                    Your routines stay strictly in your browser. Saved exam data
                    expires automatically after 15 days.
                  </p>
                </div>

                {/* Card 3: Google Calendar Sync */}
                <div className="group flex flex-1 flex-col justify-center gap-1.5 rounded-2xl glass-panel border border-teal-500/25 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-teal-400/60 hover:bg-[#0c1f2b]/80 hover:shadow-[0_12px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(94,234,212,0.12)] sm:p-5 cursor-default">
                  <div className="flex items-center gap-2.5 text-white font-semibold text-sm transition-colors duration-200 group-hover:text-teal-200">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-[#5EEAD4] transition-all duration-200 group-hover:bg-teal-400/20 group-hover:border-teal-300/50 group-hover:text-teal-200 group-hover:shadow-[0_0_14px_rgba(94,234,212,0.3)]">
                      <CalendarDays className="w-3.5 h-3.5" />
                    </div>
                    <span>Google Calendar Sync</span>
                  </div>
                  <p className="text-xs text-[#94A3B8] leading-relaxed transition-colors duration-200 group-hover:text-slate-200">
                    Add your exams & reminders directly to Google Calendar.
                    Sign-in is 100% optional.
                  </p>
                </div>
              </div>
            </div>
          </LazySection>

          {/* HOW IT WORKS (THE BLUEPRINT OF EXECUTION) */}
          <LazySection
            id="how-it-works"
            className="order-3 w-full pt-8 flex flex-col gap-6 min-w-0 max-w-full"
            minHeight="420px"
          >
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
              <div className="glass-card group flex min-h-[170px] flex-col gap-4 rounded-2xl border border-teal-500/20 bg-gradient-to-br from-[#10242b] to-[#0b151d] p-6 transition-all duration-200 hover:border-teal-400/60 hover:bg-[#122830]/90 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5),0_0_24px_rgba(94,234,212,0.14)] cursor-default">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-300/10 font-bold text-lg text-teal-200 transition-all duration-200 group-hover:border-teal-300/80 group-hover:bg-teal-300/20 group-hover:text-teal-100 group-hover:shadow-[0_0_16px_rgba(94,234,212,0.35)]">
                    1
                  </div>
                  <h3 className="font-semibold text-base text-white transition-colors duration-200 group-hover:text-teal-200">
                    Upload or Paste Drive Link
                  </h3>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed transition-colors duration-200 group-hover:text-slate-200">
                  Upload your university exam routine file (.xlsx, .xls, .csv)
                  or paste routine Drive link.
                </p>
              </div>

              {/* Step 2 */}
              <div className="glass-card group flex min-h-[170px] flex-col gap-4 rounded-2xl border border-teal-500/20 bg-gradient-to-br from-[#10242b] to-[#0b151d] p-6 transition-all duration-200 hover:border-teal-400/60 hover:bg-[#122830]/90 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5),0_0_24px_rgba(94,234,212,0.14)] cursor-default">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-300/10 font-bold text-lg text-teal-200 transition-all duration-200 group-hover:border-teal-300/80 group-hover:bg-teal-300/20 group-hover:text-teal-100 group-hover:shadow-[0_0_16px_rgba(94,234,212,0.35)]">
                    2
                  </div>
                  <h3 className="font-semibold text-base text-white transition-colors duration-200 group-hover:text-teal-200">
                    Enter Course Codes
                  </h3>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed transition-colors duration-200 group-hover:text-slate-200">
                  Add your enrolled course codes (e.g. CSE181.5). The system
                  automatically matches them case-insensitively.
                </p>
              </div>

              {/* Step 3 */}
              <div className="glass-card group flex min-h-[170px] flex-col gap-4 rounded-2xl border border-teal-500/20 bg-gradient-to-br from-[#10242b] to-[#0b151d] p-6 transition-all duration-200 hover:border-teal-400/60 hover:bg-[#122830]/90 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5),0_0_24px_rgba(94,234,212,0.14)] cursor-default">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-300/30 bg-teal-300/10 font-bold text-lg text-teal-200 transition-all duration-200 group-hover:border-teal-300/80 group-hover:bg-teal-300/20 group-hover:text-teal-100 group-hover:shadow-[0_0_16px_rgba(94,234,212,0.35)]">
                    3
                  </div>
                  <h3 className="font-semibold text-base text-white transition-colors duration-200 group-hover:text-teal-200">
                    Generate & Sync
                  </h3>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed transition-colors duration-200 group-hover:text-slate-200">
                  Instantly view your personal exam timetable. Export as PDF,
                  print cleanly, or sync to Google Calendar.
                </p>
              </div>
            </div>
          </LazySection>

          {/* TABLE SECTION */}
          <LazySection
            id="results"
            className="order-5 w-full pt-8 flex flex-col gap-4 min-w-0 max-w-full"
            minHeight="360px"
          >
            {/* Header */}
            <div className="results-heading no-print flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 border-b border-teal-500/20 pb-3">
              <div>
                <span className="mb-1 block font-mono-code text-[11px] uppercase tracking-widest text-[#5EEAD4]">
                  Results
                </span>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Your generated exam table
                </h2>
                {isRevealingRows ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                    </span>
                    <p className="text-xs font-mono text-teal-300">
                      Generating timetable... {visibleRowCount} of {generatedExams.length} exams identified
                    </p>
                  </div>
                ) : generatedExams.length > 0 ? (
                  <p className="mt-1 text-xs text-[#94A3B8]">
                    Generated: {formatGeneratedDate(new Date())}
                  </p>
                ) : null}
              </div>

              {generatedExams.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={exportPdf}
                    disabled={isRevealingRows}
                    className="btn-ghost-glass flex-1 sm:flex-initial justify-center inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={exportPng}
                    disabled={pngExporting || isRevealingRows}
                    className="btn-ghost-glass flex-1 sm:flex-initial justify-center inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pngExporting ? (
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin text-teal-400 shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    )}
                    <span>
                      {pngExporting ? "Rendering PNG..." : "Download PNG"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={printPdf}
                    disabled={isRevealingRows}
                    className="no-print btn-ghost-glass flex-1 sm:flex-initial justify-center inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>Print PDF</span>
                  </button>
                </div>
              )}
            </div>

            {/* Show futuristic animated skeleton while generating, otherwise empty state or table */}
            {generating ? (
              <div
                role="status"
                aria-live="polite"
                className="relative w-full max-w-full min-w-0 rounded-2xl glass-panel border border-teal-500/30 overflow-x-auto shadow-[0_16px_40px_rgba(0,0,0,0.6)] animate-in fade-in duration-300"
              >
                {/* Sweeping laser / scanner line across top */}
                <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#5EEAD4] to-transparent animate-shimmer" />

                <table className="routine-table w-full min-w-[760px] text-left text-sm font-sans">
                  <thead>
                    <tr className="border-b border-teal-500/30 bg-[#0B1A24]/95 font-sans font-bold text-teal-300 text-[11px] tracking-wider uppercase">
                      <th className="py-3.5 px-4 font-semibold">DATE</th>
                      <th className="py-3.5 px-4 font-semibold">DAY</th>
                      <th className="py-3.5 px-4 font-semibold">TIME</th>
                      <th className="py-3.5 px-4 font-semibold">COURSE</th>
                      <th className="py-3.5 px-4 font-semibold">
                        COURSE TITLE
                      </th>
                      <th className="py-3.5 px-4 font-semibold">FACULTY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-500/15">
                    {[
                      {
                        dateW: "w-24",
                        dayW: "w-16",
                        timeW: "w-28",
                        codeW: "w-20",
                        titleW: "w-48",
                        facW: "w-28",
                      },
                      {
                        dateW: "w-20",
                        dayW: "w-14",
                        timeW: "w-28",
                        codeW: "w-24",
                        titleW: "w-56",
                        facW: "w-32",
                      },
                      {
                        dateW: "w-24",
                        dayW: "w-16",
                        timeW: "w-28",
                        codeW: "w-20",
                        titleW: "w-40",
                        facW: "w-24",
                      },
                      {
                        dateW: "w-22",
                        dayW: "w-14",
                        timeW: "w-28",
                        codeW: "w-20",
                        titleW: "w-52",
                        facW: "w-28",
                      },
                    ].map((row, idx) => (
                      <tr key={idx} className="bg-teal-500/[0.02]">
                        <td className="py-3.5 px-4">
                          <div
                            className={`h-4 ${row.dateW} rounded-md animate-skeleton-wave border border-teal-500/20`}
                          />
                        </td>
                        <td className="py-3.5 px-4">
                          <div
                            className={`h-4 ${row.dayW} rounded-md animate-skeleton-wave border border-teal-500/15`}
                          />
                        </td>
                        <td className="py-3.5 px-4">
                          <div
                            className={`h-4 ${row.timeW} rounded-md animate-skeleton-wave border border-teal-400/25`}
                          />
                        </td>
                        <td className="py-3.5 px-4">
                          <div
                            className={`h-5 ${row.codeW} rounded-full animate-skeleton-wave border border-teal-400/40`}
                          />
                        </td>
                        <td className="py-3.5 px-4">
                          <div
                            className={`h-4 ${row.titleW} rounded-md animate-skeleton-wave border border-teal-500/15`}
                          />
                        </td>
                        <td className="py-3.5 px-4">
                          <div
                            className={`h-4 ${row.facW} rounded-md animate-skeleton-wave border border-teal-500/20`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !isHydrated ? (
              <div
                aria-hidden="true"
                className="relative flex min-h-[300px] w-full items-center justify-center rounded-2xl border border-transparent"
              />
            ) : generatedExams.length === 0 ? (
              <div className="empty-results-panel relative flex min-h-[300px] w-full items-center justify-center overflow-hidden rounded-2xl border border-teal-500/30 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.45)] sm:p-6">
                <div aria-hidden="true" className="empty-results-preview">
                  <div className="empty-preview-title">
                    <span>EXAM ROUTINE</span>
                    <span>DATE · COURSE · TIME</span>
                  </div>
                  <div className="empty-preview-row">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="empty-preview-row">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="empty-preview-row">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="empty-preview-row">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div aria-hidden="true" className="empty-results-scrim" />
                <div
                  role="status"
                  className="empty-results-card group/empty relative z-10 flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl px-5 py-6 text-center sm:px-10 sm:py-8 cursor-default select-none"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/5 text-teal-300 transition-all duration-200 group-hover/empty:border-teal-400/50 group-hover/empty:bg-teal-500/15 group-hover/empty:text-teal-100 group-hover/empty:shadow-[0_0_16px_rgba(94,234,212,0.2)]">
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
                <div className="relative w-full max-w-full min-w-0">
                  {/* Sweeping laser line indicator while revealing rows */}
                  {isRevealingRows && (
                    <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#5EEAD4] to-transparent animate-shimmer z-30" />
                  )}

                  <div
                    ref={tableWrapperRef}
                    onMouseDown={handleTableMouseDown}
                    className={`print-table-wrapper relative w-full rounded-2xl glass-panel border border-teal-500/30 overflow-x-auto shadow-[0_16px_40px_rgba(0,0,0,0.6)] transition-all duration-500 ease-out select-none cursor-grab active:cursor-grabbing ${
                      showCalendarSyncPrompt && !isSyncPromptClosing
                        ? "backdrop-blur-md opacity-35 blur-[1.5px] pointer-events-none"
                        : "opacity-100 blur-0"
                    }`}
                  >
                    <table className="routine-table w-full min-w-[760px] text-left text-sm font-sans">
                      <thead>
                        <tr className="border-b border-teal-500/30 bg-[#0B1A24]/95 font-sans font-bold text-teal-300 text-[11px] tracking-wider uppercase">
                          <th className="py-3.5 px-4 font-bold">DATE</th>
                          <th className="py-3.5 px-4 font-bold">DAY</th>
                          <th className="py-3.5 px-4 font-bold">TIME</th>
                          <th className="py-3.5 px-4 font-bold">COURSE</th>
                          <th className="py-3.5 px-4 font-bold">
                            COURSE TITLE
                          </th>
                          <th className="py-3.5 px-4 font-bold">FACULTY</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-teal-500/15 font-sans">
                        {generatedExams
                          .slice(0, visibleRowCount)
                          .map((exam, index) => (
                            <tr
                              key={exam.id}
                              className={`group/row animate-row-reveal cursor-default transition-all duration-300 ${
                                isRevealingRows && index === visibleRowCount - 1
                                  ? "bg-teal-500/15 shadow-[inset_0_0_16px_rgba(94,234,212,0.22)]"
                                  : ""
                              }`}
                            >
                            <td className="py-3.5 px-4 font-sans font-semibold text-white/95 tabular-nums whitespace-nowrap tracking-tight">
                              {formatExamDate(exam)}
                            </td>
                            <td className="py-3.5 px-4 font-sans font-medium text-slate-300 whitespace-nowrap transition-colors duration-200 group-hover/row:text-teal-200">
                              {getDayName(exam.date)}
                            </td>
                            <td className="py-3.5 px-4 font-sans font-semibold text-[#5EEAD4] tabular-nums whitespace-nowrap tracking-tight transition-colors duration-200 group-hover/row:text-teal-200">
                              {formatTime(exam.startTime)} –{" "}
                              {formatTime(exam.endTime)}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-sans font-semibold text-xs tracking-wide bg-teal-500/15 border border-teal-500/25 text-teal-200">
                                {exam.courseCode}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-sans text-white font-semibold leading-relaxed whitespace-normal transition-colors duration-200 group-hover/row:text-teal-50">
                              {exam.courseTitle}
                            </td>
                            <td className="py-3.5 px-4 font-sans font-medium text-slate-200 whitespace-nowrap transition-colors duration-200 group-hover/row:text-teal-100">
                              {formatFaculty(exam.faculty)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Right edge fade & pulse indicator when more columns exist */}
                  {tableScrollState.canRight && (
                    <div
                      onClick={() =>
                        tableWrapperRef.current?.scrollBy({
                          left: 240,
                          behavior: "smooth",
                        })
                      }
                      aria-label="Click or drag to view Faculty and details"
                      className="no-print pointer-events-auto cursor-pointer absolute right-0 top-0 bottom-0 w-12 sm:w-16 bg-gradient-to-l from-[#07131B]/95 via-[#07131B]/55 to-transparent z-20 flex items-center justify-end pr-2.5 rounded-r-2xl transition-opacity duration-300"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#091A25]/90 border border-teal-400/50 text-teal-200 shadow-[0_0_14px_rgba(94,234,212,0.4)] hover:border-teal-300 hover:bg-[#0c2432] hover:text-white hover:shadow-[0_0_18px_rgba(94,234,212,0.5)] transition-all duration-200">
                        <ChevronRight className="w-4 h-4 animate-pulse" />
                      </div>
                    </div>
                  )}

                  {/* Left edge fade & pulse indicator when scrolled right */}
                  {tableScrollState.canLeft && (
                    <div
                      onClick={() =>
                        tableWrapperRef.current?.scrollBy({
                          left: -240,
                          behavior: "smooth",
                        })
                      }
                      aria-label="Click or drag to view Date & Time"
                      className="no-print pointer-events-auto cursor-pointer absolute left-0 top-0 bottom-0 w-12 sm:w-16 bg-gradient-to-r from-[#07131B]/95 via-[#07131B]/55 to-transparent z-20 flex items-center justify-start pl-2.5 rounded-l-2xl transition-opacity duration-300"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#091A25]/90 border border-teal-400/50 text-teal-200 shadow-[0_0_14px_rgba(94,234,212,0.4)] hover:border-teal-300 hover:bg-[#0c2432] hover:text-white hover:shadow-[0_0_18px_rgba(94,234,212,0.5)] transition-all duration-200">
                        <ChevronLeft className="w-4 h-4 animate-pulse" />
                      </div>
                    </div>
                  )}

                  {/* In-Table Compact Frosted Glass Sync Overlay */}
                  {showCalendarSyncPrompt &&
                    generatedExams.length > 0 &&
                    !isSampleRoutine && (
                      <div
                        className={`no-print absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-none transition-all duration-500 ease-out ${
                          isSyncPromptClosing
                            ? "opacity-0 backdrop-blur-none"
                            : "opacity-100"
                        }`}
                      >
                        <div
                          role="dialog"
                          aria-label="Google Calendar Sync Prompt"
                          className={`pointer-events-auto relative flex flex-col items-center gap-3 rounded-2xl border border-teal-400/40 bg-[#0A1822]/90 backdrop-blur-2xl px-5 py-4 sm:px-7 text-center shadow-[0_24px_50px_rgba(0,0,0,0.85),0_0_35px_rgba(94,234,212,0.22)] w-full max-w-[calc(100vw-2.5rem)] sm:max-w-sm transition-all duration-500 ease-out ${
                            isSyncPromptClosing
                              ? "opacity-0 scale-90 translate-y-3 pointer-events-none"
                              : "opacity-100 scale-100 translate-y-0 animate-in fade-in zoom-in-95 duration-500"
                          }`}
                        >
                          {/* Ambient background glow behind card */}
                          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-teal-500/20 via-emerald-500/10 to-teal-500/20 opacity-50 blur-lg -z-10 pointer-events-none" />

                          {/* Header text or syncing title */}
                          {calendarSyncing ? (
                            <div className="flex items-center gap-2 text-teal-100 transition-all duration-300">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                              <span className="text-xs sm:text-[13px] font-semibold tracking-wide">
                                Syncing to Google Calendar…
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs sm:text-[13px] font-semibold text-white tracking-wide whitespace-nowrap transition-all duration-300">
                              Sync with Google Calendar?
                            </span>
                          )}

                          {/* Body: Either Circular Loader OR Action Buttons */}
                          {calendarSyncing ? (
                            <div className="flex flex-col items-center justify-center py-2 transition-all duration-300 animate-in fade-in zoom-in-90">
                              <div className="relative flex items-center justify-center w-10 h-10">
                                <svg
                                  aria-hidden="true"
                                  className="google-official-spinner w-8 h-8"
                                  viewBox="0 0 50 50"
                                >
                                  <circle
                                    className="google-official-spinner-path"
                                    cx="25"
                                    cy="25"
                                    r="20"
                                    fill="none"
                                    strokeWidth="4"
                                  />
                                </svg>
                              </div>
                              <span className="mt-2 text-[11px] font-mono-code text-teal-300/80 tracking-wider">
                                Adding exams & reminders…
                              </span>
                            </div>
                          ) : (
                            /* 2 icon buttons: Cross & Correct with custom frosted glass tooltips */
                            <div className="flex items-center justify-center gap-6 transition-all duration-300">
                              {/* Cross Button: Cancel / Do not sync */}
                              <div className="group/cancel relative inline-flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => closeSyncPrompt()}
                                  aria-label="Do not sync with Google Calendar"
                                  className="flex items-center justify-center bg-transparent border-0 text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 hover:shadow-[0_0_12px_rgba(244,63,94,0.3)] rounded-lg transition-all duration-150 p-1.5 cursor-pointer focus:outline-none"
                                >
                                  <X className="h-5 w-5 stroke-[2.5]" />
                                </button>
                                <div
                                  role="tooltip"
                                  className="pointer-events-none absolute top-[calc(100%+0.55rem)] left-1/2 -translate-x-1/2 z-50 rounded-lg border border-rose-500/35 bg-[#0A1822]/95 backdrop-blur-xl px-2.5 py-1 text-[10px] font-semibold tracking-wide text-rose-200 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.6),0_0_12px_rgba(244,63,94,0.25)] transition-all duration-150 group-hover/cancel:translate-y-0 group-hover/cancel:opacity-100 -translate-y-1 whitespace-nowrap flex items-center gap-1.5"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                                  <span>Don't sync</span>
                                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 border-l border-t border-rose-500/35 bg-[#0A1822]" />
                                </div>
                              </div>

                              {/* Correct Button: Confirm sync */}
                              <div className="group/sync relative inline-flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setCalendarSyncing(true);
                                    setError("");

                                    try {
                                      if (authSession && hasCalendarScope) {
                                        const ok =
                                          await syncCalendar(generatedExams);
                                        closeSyncPrompt();
                                        return;
                                      }

                                      const requireDrive =
                                        routineSourceRef.current === "drive";
                                      const popupResult =
                                        await startGoogleSignInPopup({
                                          requireDrive,
                                        });

                                      if (popupResult?.error) {
                                        closeSyncPrompt();
                                        if (
                                          popupResult.error.code ===
                                          "POPUP_CLOSED"
                                        ) {
                                          return;
                                        }
                                        if (
                                          popupResult.error.code ===
                                          "POPUP_BLOCKED"
                                        ) {
                                          setError(
                                            "Popup blocked. Please allow popups for ExamMate.",
                                          );
                                          return;
                                        }
                                        throw new Error(
                                          popupResult.error.message ||
                                            "Google authorization failed.",
                                        );
                                      }

                                      const ok =
                                        await syncCalendar(generatedExams);
                                      closeSyncPrompt();
                                      if (ok) {
                                        setHasCalendarScope(true);
                                      }
                                    } catch (err) {
                                      closeSyncPrompt();
                                      setError(
                                        err instanceof Error
                                          ? err.message
                                          : "Calendar sync failed.",
                                      );
                                    } finally {
                                      setCalendarSyncing(false);
                                    }
                                  }}
                                  aria-label="Sync to Google Calendar"
                                  className="flex items-center justify-center bg-transparent border-0 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-500/20 hover:shadow-[0_0_12px_rgba(52,211,153,0.3)] rounded-lg transition-all duration-150 p-1.5 cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Check className="h-5 w-5 stroke-[2.5]" />
                                </button>
                                <div
                                  role="tooltip"
                                  className="pointer-events-none absolute top-[calc(100%+0.55rem)] left-1/2 -translate-x-1/2 z-50 rounded-lg border border-teal-400/35 bg-[#0A1822]/95 backdrop-blur-xl px-2.5 py-1 text-[10px] font-semibold tracking-wide text-teal-200 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.6),0_0_12px_rgba(94,234,212,0.25)] transition-all duration-150 group-hover/sync:translate-y-0 group-hover/sync:opacity-100 -translate-y-1 whitespace-nowrap flex items-center gap-1.5"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                                  <span>Sync to Calendar</span>
                                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 border-l border-t border-teal-400/35 bg-[#0A1822]" />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </div>
                <div className="print-footer">ExamMate</div>
              </>
            )}
          </LazySection>

          {/* FAQ SECTION */}
          <LazySection
            id="faq"
            className="order-6 w-full pt-8 flex flex-col gap-5 min-w-0 max-w-full"
            minHeight="360px"
          >
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

            {/* Accordion-style vertical list of questions */}
            <div className="flex flex-col gap-3">
              {faqItems.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl glass-card border border-teal-500/20 overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:border-teal-400/70 hover:bg-[#0c1f2b]/80 hover:shadow-[0_16px_36px_rgba(0,0,0,0.55),0_0_20px_rgba(94,234,212,0.16)] open:border-teal-400/60 open:bg-[#0c1f2a]/80 open:shadow-[0_14px_36px_rgba(0,0,0,0.55),0_0_18px_rgba(94,234,212,0.14)]"
                >
                  <summary className="flex items-center justify-between gap-4 p-4 sm:p-5 cursor-pointer text-sm font-medium text-white hover:text-teal-200 select-none transition-colors duration-150">
                    <span className="font-medium text-white group-hover:text-teal-100 transition-colors duration-200">
                      {item.question}
                    </span>
                    <ChevronDown className="w-5 h-5 text-teal-400/80 group-hover:text-teal-200 transition-all duration-300 group-open:rotate-180 shrink-0" />
                  </summary>
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs sm:text-[13px] text-slate-300/90 leading-relaxed border-t border-teal-500/15 pt-3.5">
                    {item.answer}
                  </div>
                </details>
              ))}
            </div>
          </LazySection>
        </main>

        {/* FOOTER */}
        <LazySection
          as="footer"
          className="order-7 w-full pt-4 flex flex-col gap-4 min-w-0 max-w-full"
          minHeight="150px"
        >
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
              <Link
                href="/privacy"
                className="hover:text-teal-300 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="hover:text-teal-300 transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>

          {/* Centered credit line */}
          <div className="pb-1 text-center text-[11px] text-[#64748B]">
            © {new Date().getFullYear()} ExamMate{" "}
            <span className="px-1.5 text-teal-500/60">·</span>
            Made by{" "}
            <span className="font-medium text-[#94A3B8]">
              codewarrior-ahnaf
            </span>
          </div>
        </LazySection>
      </div>

      <CustomScrollbar />

      {(message || error || savedNotice) && (
        <div className="fixed bottom-4 sm:bottom-5 left-3 sm:left-auto right-3 sm:right-5 z-50 flex flex-col items-center sm:items-end gap-2.5 max-w-[calc(100vw-1.5rem)] sm:max-w-md pointer-events-none">
          {message && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto w-fit max-w-[min(32rem,calc(100vw-2.5rem))] flex items-center gap-2.5 rounded-xl border border-emerald-400/30 bg-[#081A16]/95 backdrop-blur-2xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-emerald-100 shadow-[0_12px_36px_rgba(0,0,0,0.6),0_0_15px_rgba(16,185,129,0.15)] animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <Check className="h-3 w-3 stroke-[2.5]" />
              </span>
              <span className="text-left whitespace-normal break-words [overflow-wrap:anywhere]">
                {message}
              </span>
              <button
                type="button"
                onClick={() => setMessage("")}
                aria-label="Dismiss message"
                className="ml-1 -mr-1 p-0.5 text-emerald-400/60 hover:text-emerald-200 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="pointer-events-auto w-fit max-w-[min(32rem,calc(100vw-2.5rem))] flex items-start gap-2.5 rounded-xl border border-rose-400/35 bg-[#251016]/95 backdrop-blur-2xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-rose-100 shadow-[0_12px_36px_rgba(0,0,0,0.6),0_0_15px_rgba(244,63,94,0.15)] animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30 mt-0.5">
                <Info className="h-3 w-3 stroke-[2.5]" />
              </span>
              <span className="min-w-0 flex-1 text-left whitespace-normal break-words [overflow-wrap:anywhere]">
                {error}
              </span>
              <button
                type="button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
                className="ml-1 -mr-1 p-0.5 text-rose-400/60 hover:text-rose-200 transition-colors cursor-pointer shrink-0 mt-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {savedNotice && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto w-fit max-w-[min(32rem,calc(100vw-2.5rem))] flex items-center gap-2.5 rounded-xl border border-teal-400/30 bg-[#08181F]/95 backdrop-blur-2xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-teal-100 shadow-[0_12px_36px_rgba(0,0,0,0.6),0_0_15px_rgba(20,184,166,0.15)] animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                <Clock className="h-3 w-3 stroke-[2.5]" />
              </span>
              <span className="text-left whitespace-normal break-words [overflow-wrap:anywhere]">
                {savedNotice}
              </span>
              <button
                type="button"
                onClick={() => setSavedNotice("")}
                aria-label="Dismiss notice"
                className="ml-1 -mr-1 p-0.5 text-teal-400/60 hover:text-teal-200 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
