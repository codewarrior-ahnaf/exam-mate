# SEU Exam Routine

SEU Exam Routine is a Next.js app for extracting course exams from CSV, Excel, and DOCX routines, matching them to course codes, and exporting a print-ready schedule.

## Requirements

- Node.js 20+
- A MongoDB connection URI
- Google OAuth client credentials only if you want to use Google sign-in

## Configure environment

Set these variables in the root `.env` file. Keep this file private; it is ignored by git.

```env
DB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<a-long-random-secret>
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
```

`DB_URI` is used by Better Auth's MongoDB adapter for authentication, sessions, and linked Google accounts. Include the database name in the URI path. MongoDB creates the needed auth collections automatically. The exam routine itself remains in this browser's local storage and expires after 15 days.

For Google sign-in, configure the OAuth client's authorized redirect URI as:

```text
http://localhost:3000/api/auth/callback/google
```

In MongoDB Atlas, allow the machine's current public IP in **Network Access** and ensure the database user has read/write access to the selected database. If the MongoDB password contains URI-reserved characters, URL-encode them.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js (normally `http://localhost:3000`). `npm run dev:all` is also available as an alias. This project currently runs as a Next.js app; it no longer requires the removed Python/FastAPI service or a Python virtual environment.

If port 3000 is already in use, Next.js will print a different local URL. Use that URL in the browser and update `BETTER_AUTH_URL` and Google's authorized redirect URI if you need Google sign-in on the alternate port.

## Data and privacy

- Routine files are parsed in the browser and are not uploaded to MongoDB.
- Generated schedules and course codes are saved in browser local storage for 15 days.
- MongoDB is used by Better Auth for account, session, and social-provider records.
- Use **Clear my data** to remove the saved routine from this browser.
