import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-12" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <Skeleton className="h-48" />
    </div>
  );
}
