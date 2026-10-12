# বাজার দর / BazarDor

**A clear, private way for SEU students to turn an official exam routine into a personal schedule.**

BazarDor reads a university routine, finds the courses you are taking, and presents your exam dates in an easy-to-read table. Upload and parsing happen in your browser, with an option to download a polished PDF.

## Acknowledgment

The project was inspired by the Python routine-processing file shared by **Tanjim Abubokor**. That reference helped shape the idea for turning routine data into a personalized exam schedule on the web.

## Technologies

- **Next.js 15** and **React 19** for the web application
- **TypeScript** for typed application code
- **Tailwind CSS** for responsive styling
- **SheetJS (xlsx)** and **Mammoth** for spreadsheet and DOCX parsing
- **jsPDF** and **jspdf-autotable** for PDF exports
- **Better Auth** and **MongoDB** for optional Google sign-in

## Key features

1. **Multiple routine formats** — Import CSV, XLS, XLSX, XLSM, and DOCX files.
2. **Personal course matching** — Add your course codes and generate a schedule containing only your exams.
3. **Easy-to-read exam table** — Review dates in DD/MM/YYYY format, days, times, course details, and faculty names.
4. **Polished PDF export** — Download a print-ready routine with ExamMate branding.
5. **Privacy-conscious storage** — Files are parsed in the browser; generated schedules are saved locally and expire after 15 days.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js, normally `http://localhost:3000`.

## Optional Google sign-in

Google sign-in uses Better Auth and MongoDB. Add the following values to a private `.env` file in the project root:

```env
DB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<a-long-random-secret>
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
```

Configure the Google OAuth authorized redirect URI as `http://localhost:3000/api/auth/callback/google`. Google sign-in is optional; routine parsing and schedule generation work without an account.

## Privacy

Routine files are processed locally in the browser and are not uploaded to MongoDB. Generated schedules and course codes stay in browser storage for up to 15 days. Use **Clear My Data** to remove them sooner.
