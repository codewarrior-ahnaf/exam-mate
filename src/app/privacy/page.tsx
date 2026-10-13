import type { Metadata } from "next";
import PolicyPage from "../policy-page";

export const metadata: Metadata = {
  title: "Privacy Policy | ExamMate",
};

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        ExamMate runs primarily in your browser. Uploaded routine files are
        processed locally on your device. Your generated exam data stays in
        your browser for up to 15 days unless you clear it sooner.
      </p>
      <p>
        The app stores only the generated exam data and selected course codes
        for up to 15 days in your browser storage. The routine file itself is
        never retained. You can clear your saved data at any time using the
        “Clear my data” action.
      </p>
      <p>
        Google sign-in is optional. If you connect Google and generate a
        schedule, ExamMate adds its exams to your primary Google Calendar with
        24-hour popup reminders. You can revoke Calendar access from your
        Google Account settings.
      </p>
    </PolicyPage>
  );
}
