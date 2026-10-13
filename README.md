# ExamMate

ExamMate turns university exam routines into a clear, personalized schedule. Upload an Excel routine (.xlsx, .xls, .csv), select your courses, then export your exams as PDF or PNG, print your schedule, or sync them with Google Calendar.

## Credit

The project structure was created based on the Python file provided by **Tanjim Abubokor**. Special credit to him for sharing the file that guided the project structure.

## Technologies

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Authentication and database:** Better Auth, MongoDB
- **File parsing:** SheetJS (`xlsx`)
- **Export & generation:** jsPDF, jspdf-autotable (PDF), HTML5 Canvas API (high-resolution PNG image export)
- **Calendar integration:** Google Calendar API

## Key features

1. **Excel Routine Upload** — Import **XLSX**, **XLS**, **XLSM**, and **CSV** spreadsheets with intelligent, in-browser parsing for seamless timetable extraction.
2. **Match courses** — Filter exams by course code into an organized, high-density schedule table or cyber matrix view.
3. **Consistent dates** — Keep uploaded date formats across the website and exported documents.
4. **Export as PDF and PNG** — Download your synthesized exam table as a clean, styled **PDF document** or high-resolution **.PNG image** (matching the exact table and branding style), or print it directly.
5. **Google Calendar sync** — Add exams and event reminders to your calendar with optional Google OAuth.

## Privacy

Uploaded files stay in your browser. The generated schedule is saved locally for 15 days; Google account data and encrypted tokens are stored in MongoDB. Exam details are sent to Google Calendar only when you sync.
