import type { Metadata } from "next";
import PolicyPage from "../policy-page";

export const metadata: Metadata = {
  title: "Privacy Policy | ExamMate",
};

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        ExamMate runs primarily in your browser. Uploaded routine files (.xlsx,
        .xls, .csv) are processed directly on your device. Your synthesized exam
        table is stored locally in your browser storage for up to 15 days so you
        can revisit your routine at any time without re-uploading. Draft input
        fields reset cleanly when you close the tab.
      </p>
      <p>
        <strong>Google Drive Link Import:</strong> When you provide a Google
        Drive or Google Sheets share link, ExamMate retrieves the spreadsheet file
        in-memory to parse the examination schedule. If the file is restricted
        to university Google accounts, connecting your Google account grants
        temporary, read-only Google Drive access (<code>drive.readonly</code>)
        strictly to fetch the routine file you requested. We never retain, store,
        or share your Google Drive files.
      </p>
      <p>
        <strong>Data Retention:</strong> Only your generated personal exam
        schedule is preserved in your device’s local browser storage for up to
        15 days. You can remove all stored data at any time by clicking the
        “Clear My Data” button.
      </p>
      <p>
        <strong>Google Calendar Integration:</strong> Google sign-in is optional.
        When connected, ExamMate adds your synthesized exams to your primary Google
        Calendar with automatic 24-hour advance reminders. You can disconnect
        Google from the navigation bar or revoke access through your Google Account
        Security settings at any time.
      </p>
    </PolicyPage>
  );
}
