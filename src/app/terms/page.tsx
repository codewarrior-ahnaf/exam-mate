import type { Metadata } from "next";
import PolicyPage from "../policy-page";

export const metadata: Metadata = {
  title: "Terms and Conditions | ExamMate",
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms and Conditions">
      
      <p className="text-slate-200 text-sm leading-relaxed">
        ExamMate is provided as a free student productivity tool for personal academic planning and convenience. By using ExamMate, you agree to the following terms and guidelines.
      </p>

      <div className="space-y-6 pt-2">
        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            1. Academic Responsibility & Verification
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            ExamMate parses and organizes data provided directly by you. While our parser is thoroughly tested for high precision, this tool does not replace official university notices, circulars, or academic regulations. Students are advised to double-check their final exam timetable against official Southeast University publications.
          </p>
        </section>

        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            2. File Uploads & Google Drive Links
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            You confirm that you have legitimate academic access to any Excel spreadsheet or Google Drive link you supply. ExamMate processes these documents strictly in-memory to filter your courses and does not distribute, publish, or permanently retain your files.
          </p>
        </section>

        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            3. Local Storage Policy
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Your matched schedule is stored locally in your browser for 15 days for convenience. You can reset or permanently delete this stored data at any time using the “Clear My Data” button.
          </p>
        </section>

        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            4. Google Calendar Synchronization
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Synchronized exam events and reminders are added to your Google Calendar upon your explicit request. ExamMate is not liable for device-level notification silences, battery optimization delays, or last-minute changes made to official university schedules.
          </p>
        </section>
      </div>
    </PolicyPage>
  );
}
