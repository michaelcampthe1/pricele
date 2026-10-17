import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6 sm:py-12" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
      <Skeleton className="h-80 rounded-[var(--radius-lg)]" />
      <span className="sr-only" role="status">Loading today&apos;s game…</span>
    </div>
  );
}
