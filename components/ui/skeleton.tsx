import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[var(--radius)] bg-surface-muted motion-reduce:animate-none", className)} />;
}
