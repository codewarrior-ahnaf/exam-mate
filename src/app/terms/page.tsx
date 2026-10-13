import type { Metadata } from "next";
import PolicyPage from "../policy-page";

export const metadata: Metadata = {
  title: "Terms and Conditions | ExamMate",
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms and Conditions">
      <p>
        ExamMate is provided for personal academic planning and convenience. The
        app assists students in organizing, filtering, and exporting exam
        schedules from university routines, but it does not replace official
        university notices or academic regulations. Always verify your final
        schedule against official Southeast University publications.
      </p>
      <p>
        <strong>File Uploads & Google Drive Links:</strong> When uploading an
        Excel routine file or providing a Google Drive share link, you confirm that
        you have the right to access and view the document. ExamMate parses files
        in-memory and does not retain uploaded spreadsheets or Drive files on
        server storage.
      </p>
      <p>
        <strong>Local Storage:</strong> Your generated examination schedule is
        retained on your device’s local browser storage for up to 15 days for
        your planning convenience. You may clear this data at any time.
      </p>
      <p>
        <strong>Google Calendar Sync:</strong> Synchronized exam events and
        24-hour reminders are added to your primary Google Calendar upon request.
        ExamMate is not responsible for calendar notification deliveries or
        schedule discrepancies resulting from routine revisions published by the
        university.
      </p>
    </PolicyPage>
  );
}
