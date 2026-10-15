import type { Metadata } from "next";
import PolicyPage from "../policy-page";

export const metadata: Metadata = {
  title: "Privacy Policy | ExamMate",
};

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      
      <p className="text-slate-200 text-sm leading-relaxed">
        ExamMate is built with a <strong>privacy-first, client-side architecture</strong>. We believe your academic schedules and personal files belong strictly to you. This policy outlines how your data is processed, stored, and protected.
      </p>

      <div className="space-y-6 pt-2">
        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            1. Client-Side Processing (Zero Server Storage)
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Uploaded routine spreadsheets (.xlsx, .xls, .xlsm, .csv) are parsed directly in your browser memory. We do not upload, retain, or store your original spreadsheet files on any external server or database. Once parsing completes or your browser tab closes, in-memory files are automatically discarded.
          </p>
        </section>

        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            2. Google Drive Link Import
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            When you provide a Google Drive or Google Sheets link, ExamMate fetches only the requested spreadsheet file to parse the examination schedule. If the file requires institutional access (@seu.edu.bd), connecting your Google account grants temporary, read-only permission (<code>drive.readonly</code>) strictly to download that specific file. We never read, modify, store, or share any other files in your Google Drive.
          </p>
        </section>

        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            3. Local Storage & Data Retention
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            To save you from re-uploading routines every time you visit, your generated exam table is saved exclusively in your device's local browser storage. This data expires automatically after <strong>15 days</strong>. You can permanently delete all stored schedules at any moment by clicking the <strong>“Clear My Data”</strong> button in the routine generator.
          </p>
        </section>

        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            4. Google Calendar Integration
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Connecting Google is entirely optional. When you choose to sync your routine, ExamMate adds your matched exam events and reminders to your primary Google Calendar. You can disconnect your Google account at any time via the navigation button or revoke access directly in your Google Account Security settings.
          </p>
        </section>

        <section className="rounded-xl border border-teal-500/15 bg-teal-950/20 p-4 sm:p-5">
          <h2 className="text-white font-semibold text-base mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            5. No Tracking & No Third-Party Ads
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            ExamMate does not sell user data, run third-party advertising networks, or track your browsing activity across other websites.
          </p>
        </section>
      </div>
    </PolicyPage>
  );
}
