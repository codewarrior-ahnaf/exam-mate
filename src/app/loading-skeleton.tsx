export default function PageLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading ExamMate"
      aria-busy="true"
      className="page-skeleton min-h-screen w-full text-slate-100"
    >
      <div aria-hidden="true" className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-3 pb-16 pt-3 sm:gap-10 sm:px-6 sm:pt-4 lg:px-8">
        <div className="page-skeleton-block h-12 w-full rounded-2xl" />
        <section className="grid min-h-[390px] grid-cols-1 items-center gap-8 pt-2 lg:min-h-[460px] lg:grid-cols-12 lg:gap-12">
          <div className="flex flex-col gap-5 lg:col-span-7">
            <div className="page-skeleton-block h-12 w-4/5 rounded-md sm:h-16" />
            <div className="page-skeleton-block h-4 w-full max-w-lg rounded-full" />
            <div className="page-skeleton-block h-4 w-3/4 max-w-lg rounded-full" />
            <div className="page-skeleton-block mt-3 h-10 w-40 rounded-full" />
          </div>
          <div className="page-skeleton-block hidden h-[260px] rounded-2xl lg:col-span-5 lg:block" />
        </section>
        <section className="grid grid-cols-1 gap-5 pt-2 lg:grid-cols-12">
          <div className="flex flex-col gap-5 rounded-2xl border border-teal-500/15 bg-[#0d1b22]/45 p-5 sm:p-6 lg:col-span-8">
            <div className="page-skeleton-block h-5 w-2/3 rounded-full" />
            <div className="page-skeleton-block page-skeleton-upload min-h-36 rounded-xl" />
            <div className="page-skeleton-block h-12 w-full rounded-xl" />
            <div className="flex gap-3 border-t border-teal-500/10 pt-4">
              <div className="page-skeleton-block h-10 w-32 rounded-full" />
              <div className="page-skeleton-block h-10 w-36 rounded-full" />
            </div>
          </div>
          <div className="hidden flex-col gap-4 lg:col-span-4 lg:flex">
            <div className="page-skeleton-block h-28 rounded-2xl" />
            <div className="page-skeleton-block h-28 rounded-2xl" />
          </div>
        </section>
        <section className="page-skeleton-block min-h-[280px] rounded-2xl sm:min-h-[340px]" />
        <div className="page-skeleton-block h-28 rounded-2xl" />
        <div className="page-skeleton-block h-16 rounded-xl" />
      </div>
      <span className="sr-only">Loading page content…</span>
    </div>
  );
}
