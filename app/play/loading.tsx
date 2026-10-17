import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pb-10 pt-6 sm:pt-10" aria-busy="true" aria-label="Loading today's game">
      <Skeleton className="h-4 w-40" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-16" />
      <Skeleton className="h-13" />
    </div>
  );
}
