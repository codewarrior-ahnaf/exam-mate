import * as XLSX from "xlsx";
import type { ParsedExam } from "@/lib/parsers/normalize";
import { findHeaderRow, normalizeRow } from "@/lib/parsers/normalize";

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
    let previousTime = "";

    for (const row of rows.slice(header.index + 1)) {
      const courseCode = cellValue(row, header.columns.courseCode);
      const dateCell = cellValue(row, header.columns.date);
      if (dateCell && dateCell !== previousDate) {
        previousDate = dateCell;
        previousTime = "";
      }
      const rawDate = dateCell || previousDate;

      const timeCell = cellValue(row, header.columns.time);
      if (timeCell) {
        previousTime = timeCell;
      }
      const rawTime = timeCell || previousTime;

      if (!courseCode || !rawDate) continue;

      const exam = normalizeRow({
        courseCode,
        courseTitle: cellValue(row, header.columns.courseTitle),
        date: rawDate,
        time: rawTime,
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
