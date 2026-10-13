import * as XLSX from "xlsx";
import type { ParsedExam } from "@/lib/parsers/normalize";
import {
  extractCourseCodes,
  extractDateFromText,
  extractTimeFromText,
  findHeaderRow,
  normalizeRow,
} from "@/lib/parsers/normalize";

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
    let previousStartTime = "";
    let previousEndTime = "";

    const skipRows = header.headerRowCount ?? 1;
    for (const row of rows.slice(header.index + skipRows)) {
      // 1. Course code
      let courseCode = cellValue(row, header.columns.courseCode);
      if (!courseCode) {
        for (const cell of row) {
          const found = extractCourseCodes(String(cell ?? ""));
          if (found.length > 0) {
            courseCode = found[0].code;
            break;
          }
        }
      }

      // 2. Date
      const dateCell = cellValue(row, header.columns.date);
      if (dateCell && dateCell !== previousDate) {
        previousDate = dateCell;
        previousTime = "";
        previousStartTime = "";
        previousEndTime = "";
      } else if (!previousDate) {
        const detected = extractDateFromText(row.map((c) => String(c ?? "")).join(" "));
        if (detected) previousDate = detected.raw;
      }
      const rawDate = dateCell || previousDate;

      // 3. Time (support both generic Time slot and separate Start/End Time columns)
      const timeCell = cellValue(row, header.columns.time);
      const startCell = cellValue(row, header.columns.startTime);
      const endCell = cellValue(row, header.columns.endTime);

      if (timeCell) previousTime = timeCell;
      if (startCell) previousStartTime = startCell;
      if (endCell) previousEndTime = endCell;

      if (!timeCell && !startCell && !endCell && !previousTime && (!previousStartTime || !previousEndTime)) {
        const detectedTime = extractTimeFromText(row.map((c) => String(c ?? "")).join(" "));
        if (detectedTime) {
          previousTime = detectedTime.raw;
          previousStartTime = detectedTime.start;
          previousEndTime = detectedTime.end;
        }
      }

      const rawTime = timeCell || previousTime;
      const rawStartTime = startCell || previousStartTime;
      const rawEndTime = endCell || previousEndTime;

      if (!courseCode || !rawDate) continue;

      const exam = normalizeRow({
        courseCode,
        courseTitle: cellValue(row, header.columns.courseTitle),
        date: rawDate,
        time: rawTime,
        startTime: rawStartTime,
        endTime: rawEndTime,
        faculty: cellValue(row, header.columns.faculty),
        program: cellValue(row, header.columns.program),
        section: cellValue(row, header.columns.section),
      });

      if (exam) exams.set(exam.id, exam);
    }
  }

  if (!foundRoutineHeaders) {
    throw new Error(
      "Couldn't find a routine table in this Excel file. Ensure there is a header row with Course Code, Date, and Time.",
    );
  }

  if (!exams.size) {
    throw new Error(
      "Routine headers were found in the Excel file, but no complete exam rows could be read. Check that each row includes a course code, date, and time.",
    );
  }

  return [...exams.values()];
}
