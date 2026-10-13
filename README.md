# ExamMate

ExamMate turns university exam routines into a clear, personalized schedule. Upload an Excel routine (.xlsx, .xls, .csv) or paste a Google Drive link, select your courses, and generate your schedule with one click. Export your exams as PDF or PNG, print your schedule, or sync them with Google Calendar.

## Credit

The project structure was created based on the Python script provided by **Tanjim Abubokor**. Special credit to him for sharing the script that guided the project architecture.

## Technologies

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, DaisyUI
- **Authentication & Database:** Better Auth (Google OAuth 2.0 with Calendar & Drive scopes), MongoDB
- **File Parsing:** SheetJS (`xlsx`)
- **Export & Rendering:** jsPDF, jspdf-autotable (PDF), HTML5 Canvas API (custom high-res PNG renderer)
- **Integrations:** Google Calendar API, Google Drive API v3

## Key Features

1. **Excel Routine Upload & Management**
   - Import **XLSX**, **XLS**, **XLSM**, and **CSV** spreadsheets with intelligent in-memory parsing.
   - Dedicated **Remove file** button allows quick clearing of uploaded files.

2. **Google Drive Link Import & Auto-Scanning**
   - Paste a Google Drive or Google Sheets file link directly into Option 2.
   - **Campus-Restricted Link Support**: For Southeast University (`@seu.edu.bd`) files that require login, clicking **Generate** triggers seamless Google Sign-In. The backend securely scans and reads the spreadsheet in the background via read-only Google Drive API (`drive.readonly`) and immediately builds your routine table.

3. **Intelligent Course Filtering**
   - Filter and match course codes case-insensitively, supporting specific sections (e.g. `CSE181.5`).
   - Clean, removable course chips with keyboard and comma-separated entry.

4. **15-Day Local Schedule Persistence**
   - Your generated routine table remains saved on your device for **15 days**, so returning to the app immediately displays your schedule.
   - When closing and reopening the browser tab, the upload routine fields (file dropzone, Drive link box, course draft) reset cleanly to blank, leaving your generated table intact.

5. **Export & Print**
   - High-resolution **PNG image export** rendered with custom HTML5 Canvas styling and watermark.
   - Vector **PDF document export** with formatted tables.
   - Native browser **Print** stylesheet.

6. **Google Calendar Synchronization**
   - One-click sync to your primary Google Calendar.
   - Automatically schedules **24-hour advance popup reminders** before each examination.
