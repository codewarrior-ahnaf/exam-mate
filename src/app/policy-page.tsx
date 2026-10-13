import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PolicyPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen px-4 py-12 sm:px-6">
      <article className="mx-auto w-full max-w-3xl rounded-2xl border border-teal-200/20 bg-[#0d1b22]/80 p-6 shadow-2xl backdrop-blur-xl sm:p-10">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-teal-200 transition-colors hover:text-teal-100"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to ExamMate
        </Link>
        <h1 className="mb-6 border-b border-teal-500/20 pb-4 font-tech text-2xl font-bold text-white sm:text-3xl">
          {title}
        </h1>
        <div className="space-y-4 text-sm leading-relaxed text-[#cbd5e1]">
          {children}
        </div>
      </article>
    </main>
  );
}
