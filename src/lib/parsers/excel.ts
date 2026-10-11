import * as XLSX from "xlsx";
import type { ParsedExam } from "@/lib/parsers/normalize";
import { normalizeRow } from "@/lib/parsers/normalize";

export async function parseExcelFile(file: File): Promise<ParsedExam[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const rows: Array<Record<string, unknown>> = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    rows.push(
      ...jsonRows.map((row) => {
        const cleaned: Record<string, unknown> = {};
        Object.entries(row).forEach(([key, value]) => {
          cleaned[String(key).trim()] = value;
        });
        return cleaned;
      }),
    );
  });

  const data = rows
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        mapped[normalizedKey] = value;
      });

      const courseCode = mapped["course code"] ?? mapped["coursecode"] ?? row["Course Code"] ?? row["course_code"];
      const courseTitle = mapped["course title"] ?? mapped["coursetitle"] ?? row["Course Title"] ?? row["course_title"];
      const date = mapped["date"] ?? mapped["exam date"] ?? row["Date"] ?? row["Exam Date"];
      const time = mapped["time"] ?? mapped["exam time"] ?? row["Time"] ?? row["Exam Time"];
      const faculty = mapped["faculty"] ?? mapped["teacher"] ?? mapped["lecturer"] ?? row["Faculty"] ?? row["Teacher"];
      const program = mapped["program"] ?? mapped["department"] ?? row["Program"] ?? row["Department"];
      const startTime = mapped["start time"] ?? mapped["starttime"] ?? row["Start Time"];
      const endTime = mapped["end time"] ?? mapped["endtime"] ?? row["End Time"];

      return normalizeRow({
        courseCode,
        courseTitle,
        date,
        time,
        faculty,
        program,
        startTime,
        endTime,
      });
    })
    .filter(Boolean) as ParsedExam[];

  return data.filter((exam) => exam.courseCode && exam.date);
}
