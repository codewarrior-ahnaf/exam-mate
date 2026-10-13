# ExamMate

ExamMate turns university exam routines into a clear, personalized schedule. Upload a routine, select your courses, then export your exams or sync them with Google Calendar.

## Credit

The project structure was created based on the Python file provided by **Tanjim Abubokor**. Special credit to him for sharing the file that guided the project structure.

## Technologies

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Authentication and database:** Better Auth, MongoDB
- **File parsing:** SheetJS (`xlsx`), Mammoth
- **PDF generation:** jsPDF, jspdf-autotable
- **Calendar integration:** Google Calendar API

## Key features

1. **Upload routines** — Import CSV, XLS, XLSX, XLSM, or DOCX files.
2. **Match courses** — Filter exams by course code in a clear schedule table.
3. **Consistent dates** — Keep uploaded date formats across the website and PDF exports.
4. **PDF export** — Download or print your exam schedule.
5. **Google Calendar sync** — Add exams and reminders to your calendar.


## Privacy

Uploaded files stay in your browser. The generated schedule is saved locally for 15 days; Google account data and encrypted tokens are stored in MongoDB. Exam details are sent to Google Calendar only when you sync.
