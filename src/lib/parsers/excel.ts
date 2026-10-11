import * as XLSX from "xlsx";
import type { ParsedExam } from "@/lib/parsers/normalize";
import { normalizeHeader, normalizeRow } from "@/lib/parsers/normalize";

type HeaderField = "courseCode" | "courseTitle" | "date" | "time" | "startTime" | "endTime" | "faculty" | "program";
type HeaderColumns = Partial<Record<HeaderField, number>>;

const HEADER_ALIASES: Record<HeaderField, string[]> = {
  courseCode: ["course code", "coursecode", "course no", "course number", "subject code", "code"],
  courseTitle: ["course title", "course name", "subject title", "subject name", "title"],
  date: ["date", "exam date", "examination date", "date of exam", "date of examination", "exam day"],
  time: ["time", "exam time", "examination time", "exam time slot", "time slot", "session"],
  startTime: ["start", "start time", "starting time", "from"],
  endTime: ["end", "end time", "ending time", "to", "until"],
  faculty: ["faculty", "teacher", "instructor", "lecturer"],
  program: ["program", "department", "semester", "batch"],
};

function getHeaderField(value: unknown): HeaderField | undefined {
  const header = normalizeHeader(String(value ?? ""));
  return (Object.entries(HEADER_ALIASES) as [HeaderField, string[]][]).find(([, aliases]) =>
    aliases.includes(header),
  )?.[0];
}

function findHeaderRow(rows: unknown[][]): { index: number; columns: HeaderColumns } | undefined {
  let best: { index: number; columns: HeaderColumns; score: number } | undefined;
  const scanLimit = Math.min(rows.length, 60);

  for (let index = 0; index < scanLimit; index += 1) {
    const columns: HeaderColumns = {};
    rows[index]?.forEach((value, columnIndex) => {
      const field = getHeaderField(value);
      if (field && columns[field] === undefined) columns[field] = columnIndex;
    });

    const hasTimeColumn = columns.time !== undefined || columns.startTime !== undefined || columns.endTime !== undefined;
    if (columns.courseCode === undefined || columns.date === undefined || !hasTimeColumn) continue;

    const score = Object.keys(columns).length;
    if (!best || score > best.score) best = { index, columns, score };
  }

  return best;
}

function cellValue(row: unknown[], column: number | undefined): string {
  if (column === undefined) return "";
  const value = row[column];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export async function parseExcelFile(file: File): Promise<ParsedExam[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const exams = new Map<string, ParsedExam>();
  let foundRoutineHeaders = false;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const header = findHeaderRow(rows);
    if (!header) continue;

    foundRoutineHeaders = true;
    let previousDate = "";

    for (const row of rows.slice(header.index + 1)) {
      const courseCode = cellValue(row, header.columns.courseCode);
      const rawDate = cellValue(row, header.columns.date) || previousDate;
      if (cellValue(row, header.columns.date)) previousDate = rawDate;
      if (!courseCode || !rawDate) continue;

      const exam = normalizeRow({
        courseCode,
        courseTitle: cellValue(row, header.columns.courseTitle),
        date: rawDate,
        time: cellValue(row, header.columns.time),
        startTime: cellValue(row, header.columns.startTime),
        endTime: cellValue(row, header.columns.endTime),
        faculty: cellValue(row, header.columns.faculty),
        program: cellValue(row, header.columns.program),
      });

      if (exam) exams.set(exam.id, exam);
    }
  }

  if (!foundRoutineHeaders) {
    throw new Error(
      "Couldn't find a routine table. Add a header row with Course Code, Date, and Time (or Start Time and End Time).",
    );
  }

  if (!exams.size) {
    throw new Error(
      "Routine headers were found, but no complete exam rows could be read. Check that each row has a course code, date, and valid time.",
    );
  }

  return [...exams.values()];
}
