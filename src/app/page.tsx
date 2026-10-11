"use client";

import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  Clock3,
  Download,
  FileText,
  LoaderCircle,
  LogIn,
  Printer,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { authClient } from "@/lib/auth-client";
import { formatDate, formatTime, normalizeCourseCode } from "@/lib/date";
import { parseDocxFile } from "@/lib/parsers/docx";
import { parseExcelFile } from "@/lib/parsers/excel";
import type { ParsedExam } from "@/lib/parsers/normalize";

const ROUTINE_STORAGE_KEY = "examMate:routine:v1";

async function parseRoutineFile(file: File): Promise<ParsedExam[]> {
  const extension = file.name.toLowerCase();
  if (extension.endsWith(".docx")) return parseDocxFile(file);
  if (extension.endsWith(".csv") || extension.endsWith(".xlsx") || extension.endsWith(".xls") || extension.endsWith(".xlsm")) {
    return parseExcelFile(file);
  }
  return [];
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

function isValidStoredRoutine(value: unknown): value is {
  version: number;
  savedAt: string;
  expiresAt: string;
  courseCodes: string[];
  exams: ParsedExam[];
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === "number" &&
    typeof candidate.savedAt === "string" &&
    typeof candidate.expiresAt === "string" &&
    Array.isArray(candidate.courseCodes) &&
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

function Home() {
  const { data: authSession } = authClient.useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [fileName, setFileName] = useState("");
  const [courseInput, setCourseInput] = useState("");
  const [allExams, setAllExams] = useState<ParsedExam[]>([]);
  const [generatedExams, setGeneratedExams] = useState<ParsedExam[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const selectedCourseCodes = useMemo(() => {
    return Array.from(
      new Set(
        courseInput
          .split(/[\n,]+/)
          .map((value) => normalizeCourseCode(value))
          .filter(Boolean),
      ),
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
      setCourseInput(parsed.courseCodes.join(", "));
      setSavedNotice(`Saved routine restored - expires on ${formatDate(parsed.expiresAt.slice(0, 10))}`);
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

  function persistRoutine(exams: ParsedExam[], codes: string[]) {
    const savedAt = new Date();
    const expiresAt = new Date(savedAt.getTime() + 15 * 24 * 60 * 60 * 1000);
    const payload = {
      version: 1,
      savedAt: savedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      courseCodes: codes,
      exams: sortExams(exams),
    };

    try {
      window.localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage can be unavailable; keep the routine in memory only.
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    setUploading(true);
    setError("");
    setMessage("");
    setFileName(nextFile.name);

    try {
      const parsed = await parseRoutineFile(nextFile);
      if (!parsed.length) {
        throw new Error("This file could not be read reliably. Please upload a CSV, Excel, or DOCX routine and check the headers.");
      }
      setAllExams(sortExams(parsed));
      setMessage(`Parsed ${parsed.length} exam entries successfully.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not parse this routine file.");
      setAllExams([]);
      setGeneratedExams([]);
    } finally {
      setUploading(false);
    }
  }

  function handleGenerate() {
    if (!allExams.length) {
      setError("Upload your routine file before generating the exam table.");
      return;
    }
    if (!selectedCourseCodes.length) {
      setError("Enter at least one course code to generate your exam schedule.");
      return;
    }

    setGenerating(true);
    setError("");
    setMessage("");

    const matches = sortExams(
      allExams.filter((exam) => selectedCourseCodes.some((code) => normalizeCourseCode(code) === normalizeCourseCode(exam.courseCode))),
    );
    const unmatched = selectedCourseCodes.filter(
      (code) => !allExams.some((exam) => normalizeCourseCode(exam.courseCode) === normalizeCourseCode(code)),
    );

    setGeneratedExams(matches);
    persistRoutine(matches, selectedCourseCodes);

    if (!matches.length) {
      setError(`No matching exams were found for: ${unmatched.join(", ")}.`);
      setGenerating(false);
      return;
    }

    setMessage(
      `${matches.length} exam${matches.length > 1 ? "s" : ""} ready. ${unmatched.length ? `Not found: ${unmatched.join(", ")}.` : ""}`,
    );
    setGenerating(false);
  }

  function clearSavedRoutine() {
    setGeneratedExams([]);
    setCourseInput("");
    setFileName("");
    setAllExams([]);
    if (inputRef.current) inputRef.current.value = "";
    try {
      window.localStorage.removeItem(ROUTINE_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
    if (authSession) {
      void authClient.signOut();
    }
    setSavedNotice("");
    setMessage("Saved routine cleared.");
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
      setError(connectError instanceof Error ? connectError.message : "Google sign-in could not start.");
    } finally {
      setGoogleLoading(false);
    }
  }

  function exportPdf() {
    if (!generatedExams.length) {
      setError("Generate your exam table first before downloading a PDF.");
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("ExamMate Routine", 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDate(new Date().toISOString().slice(0, 10))}`, 14, 26);
    doc.text(`Selected courses: ${selectedCourseCodes.join(", ") || "All"}`, 14, 32);

    const rows = generatedExams.map((exam) => [
      formatDate(exam.date),
      getDayName(exam.date),
      formatTime(exam.startTime),
      formatTime(exam.endTime),
      exam.courseCode,
      exam.courseTitle,
      exam.faculty,
    ]);

    autoTable(doc, {
      head: [["Date", "Day", "Start Time", "End Time", "Course Code", "Course Title", "Faculty / Teacher"]],
      body: rows,
      startY: 40,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [23, 86, 62], textColor: 255 },
      margin: { left: 14, right: 14 },
      alternateRowStyles: { fillColor: [245, 248, 245] },
    });

    doc.save("exam-mate-routine.pdf");
  }

  const faqItems = [
    {
      question: "Does the core routine generator work without logging in?",
      answer: "Yes. You can upload a routine, enter your course codes, and generate a personal table immediately without creating an account.",
    },
    {
      question: "Which file types can I upload?",
      answer: "CSV, XLSX, XLS, XLSM, and DOCX files are supported. The parser automatically detects the relevant columns and normalizes the schedule.",
    },
    {
      question: "What happens to my data?",
      answer: "Everything stays in your browser and is stored locally for 15 days. The generated routine is not uploaded anywhere unless you choose to connect Google Calendar.",
    },
    {
      question: "Can I sync the final routine to Google Calendar?",
      answer: "Yes. Google Calendar sync is optional and only requested when you decide to connect your account. The app keeps the event reminders aligned to Asia/Dhaka time.",
    },
  ];

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark"><CalendarDays size={18} /></div>
          <span>ExamMate</span>
        </div>
        <nav className="topnav" aria-label="Main navigation">
          <a href="#generator">Generator</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
        </nav>
        <button type="button" className="connect-ghost" onClick={handleGoogleConnect} disabled={googleLoading}>
          {googleLoading ? <LoaderCircle size={14} className="spin" /> : <LogIn size={14} />}
          {authSession ? "Google connected" : "Connect Google"}
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={12} /> exam routine generator</div>
          <h1>Build your exam table in minutes.</h1>
          <p>Upload your routine, match your courses, and generate a clean, print-ready exam plan without the stress.</p>
          <div className="hero-actions">
            <a href="#generator" className="primary-button">Generate routine <ArrowRight size={16} /></a>
            <button type="button" className="secondary-button" onClick={() => window.print()}>Print</button>
          </div>
          <ul className="hero-points">
            <li><Check size={14} /> Works with no login</li>
            <li><Check size={14} /> Saved for 15 days</li>
            <li><Check size={14} /> PDF export + print</li>
          </ul>
        </div>
        <div className="hero-card">
          <div className="mini-status"><span className="status-dot" /> Local-only routine</div>
          <h2>Ready for your next exam.</h2>
          <div className="mini-grid">
            <div>
              <strong>{selectedCourseCodes.length || 0}</strong>
              <span>selected courses</span>
            </div>
            <div>
              <strong>{generatedExams.length || 0}</strong>
              <span>generated exams</span>
            </div>
          </div>
          <div className="mini-list">
            <span><CalendarDays size={14} /> dd-mm-yyyy format</span>
            <span><Bell size={14} /> reminder-ready</span>
          </div>
        </div>
      </section>

      <section id="generator" className="content-section">
        <div className="section-header">
          <div>
            <div className="eyebrow"><ShieldCheck size={12} /> Generator</div>
            <h2>Upload routine and create your personal exam table</h2>
          </div>
        </div>

        <div className="generator-grid">
          <div className="panel form-panel">
            <label className={`upload-box ${uploading ? "loading" : ""}`}>
              <input type="file" accept=".csv,.xlsx,.xls,.xlsm,.docx" onChange={handleFileChange} ref={inputRef} />
              <UploadCloud size={24} />
              <strong>{fileName || "Choose an exam routine file"}</strong>
              <span>{fileName ? "Click to replace the selected file" : "Upload a CSV, Excel, or DOCX routine"}</span>
            </label>

            <div className="field-group">
              <label htmlFor="course-codes">Course codes</label>
              <textarea id="course-codes" value={courseInput} onChange={(event) => setCourseInput(event.target.value)} placeholder="e.g. CSE101, CSE 102, CSE-103" rows={3} />
            </div>

            <div className="panel-actions">
              <button type="button" className="primary-button" onClick={handleGenerate} disabled={generating || uploading}>
                {generating ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                Generate
              </button>
              <button type="button" className="secondary-button" onClick={clearSavedRoutine}>
                <Trash2 size={16} />
                Clear my data
              </button>
            </div>

            {message && <div className="notice success">{message}</div>}
            {error && <div className="notice error">{error}</div>}
            {savedNotice && <div className="notice info">{savedNotice}</div>}
          </div>

          <div className="panel info-panel">
            <div className="info-card">
              <div className="info-title"><Clock3 size={16} /> Time</div>
              <p>Dates are displayed in dd-mm-yyyy format and times are normalized to a 12-hour schedule.</p>
            </div>
            <div className="info-card">
              <div className="info-title"><ShieldCheck size={16} /> Privacy</div>
              <p>Your routine stays on this device for 15 days. The app only stores the generated exam data and selected course codes.</p>
            </div>
            <div className="info-card">
              <div className="info-title"><Bell size={16} /> Calendar</div>
              <p>Google Calendar sync is optional and only happens after you decide to connect your account.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="content-section results-section">
        <div className="section-header">
          <div>
            <div className="eyebrow"><CalendarDays size={12} /> Results</div>
            <h2>Your generated exam table</h2>
          </div>
          {generatedExams.length > 0 && (
            <div className="table-actions">
              <button type="button" className="secondary-button" onClick={exportPdf}><Download size={14} /> Download PDF</button>
              <button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={14} /> Print</button>
            </div>
          )}
        </div>

        {generatedExams.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Course Code</th>
                  <th>Course Title</th>
                  <th>Faculty / Teacher</th>
                </tr>
              </thead>
              <tbody>
                {generatedExams.map((exam) => (
                  <tr key={exam.id}>
                    <td>{formatDate(exam.date)}</td>
                    <td>{getDayName(exam.date)}</td>
                    <td>{formatTime(exam.startTime)}</td>
                    <td>{formatTime(exam.endTime)}</td>
                    <td>{exam.courseCode}</td>
                    <td>{exam.courseTitle}</td>
                    <td>{exam.faculty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <FileText size={18} />
            <p>No exam table yet. Upload a routine and generate your schedule.</p>
          </div>
        )}
      </section>

      <section id="how-it-works" className="content-section">
        <div className="section-header">
          <div>
            <div className="eyebrow"><Sparkles size={12} /> How it works</div>
            <h2>Three simple steps</h2>
          </div>
        </div>

        <div className="steps-grid">
          <div className="step-card">
            <span>1</span>
            <h3>Upload your routine</h3>
            <p>Add a CSV, Excel, or DOCX routine file from your device and let the app detect the relevant exam columns.</p>
          </div>
          <div className="step-card">
            <span>2</span>
            <h3>Enter course codes</h3>
            <p>Type or paste the codes you are taking. The parser matches them case-insensitively and ignores spaces and dashes.</p>
          </div>
          <div className="step-card">
            <span>3</span>
            <h3>Generate and export</h3>
            <p>Review your table, print it, download a PDF, or connect Google Calendar for reminders.</p>
          </div>
        </div>
      </section>

      <section id="faq" className="content-section">
        <div className="section-header">
          <div>
            <div className="eyebrow"><Bell size={12} /> FAQ</div>
            <h2>Questions students usually ask</h2>
          </div>
        </div>

        <div className="faq-list">
          {faqItems.map((item) => (
            <div key={item.question} className="faq-item">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div>
          <strong>ExamMate</strong>
          <p>Clean exam planning for students who need a calmer routine.</p>
        </div>
        <div className="footer-links">
          <a href="#privacy">Privacy Policy</a>
          <a href="#terms">Terms</a>
        </div>
      </footer>

      <section id="privacy" className="policy-section">
        <h3>Privacy Policy</h3>
        <p>ExamMate runs primarily in your browser. Uploaded routine files are processed locally on your device and are not sent to a server unless you explicitly connect Google Calendar. The app stores only the generated exam data and selected course codes for 15 days in your browser storage. The routine file itself is never retained. You can clear your saved data at any time using the “Clear my data” action. Google OAuth is optional and is only used to request Calendar access if you choose to sync your exam events.</p>
      </section>

      <section id="terms" className="policy-section">
        <h3>Terms</h3>
        <p>ExamMate is provided for personal academic planning. The app helps you organize and export your exam schedule, but it does not replace your official routine or university notices. We do not store exam files after processing and only keep the generated routine in browser storage for convenience. If Google Calendar is connected, event sync is subject to your Google account permissions and availability.</p>
      </section>
    </main>
  );
}

export default Home;
