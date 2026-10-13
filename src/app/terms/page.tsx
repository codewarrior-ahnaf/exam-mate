import type { Metadata } from "next";
import PolicyPage from "../policy-page";

export const metadata: Metadata = {
  title: "Terms and Conditions | ExamMate",
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms and Conditions">
      <p>
        ExamMate is provided for personal academic planning. The app helps you
        organize and export your exam schedule, but it does not replace your
        official routine or university notices.
      </p>
      <p>
        We do not store exam files after processing and only keep the generated
        routine in browser storage for convenience.
      </p>
      <p>
        Connected schedules are added to your primary Google Calendar. Each
        event includes the course code and exam time, with a Google Calendar
        popup reminder 24 hours beforehand. Your generated routine is intended
        as a personal planning aid and should be checked against official
        notices.
      </p>
    </PolicyPage>
  );
}
