const STYLES: Record<string, string> = {
  draft: "bg-sunk text-ink-soft",
  approved: "bg-green-tint text-green-strong",
  published: "bg-ink text-white",
  scheduled: "bg-green-tint text-green-strong",
  archived: "bg-sunk text-muted",
  withdrawn: "bg-red-tint text-red",
  verified: "bg-green-tint text-green-strong",
  unverified: "bg-amber-tint text-amber",
  needs_review: "bg-amber-tint text-amber",
  missing: "bg-red-tint text-red",
  open: "bg-amber-tint text-amber",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[status] ?? "bg-sunk text-ink-soft"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
