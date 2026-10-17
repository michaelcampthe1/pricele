import { cn } from "@/lib/cn";

const TONES: Record<string, string> = {
  draft: "bg-surface-muted text-ink-soft",
  approved: "bg-accent-soft text-accent-strong",
  published: "bg-accent text-accent-ink",
  scheduled: "bg-warning-soft text-warning",
  withdrawn: "bg-error-soft text-error",
  archived: "bg-surface-muted text-muted",
  verified: "bg-accent-soft text-accent-strong",
  unverified: "bg-warning-soft text-warning",
  rejected: "bg-error-soft text-error",
  missing: "bg-error-soft text-error",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", TONES[status] ?? "bg-surface-muted text-ink-soft", className)}>
      {status}
    </span>
  );
}
