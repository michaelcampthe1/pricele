import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { Difficulty } from "@/lib/game/types";
import { DIFFICULTY_LABEL } from "@/lib/game/types";

/** Difficulty shown as a word plus 1–3 pips, so it never relies on color alone. */
export function DifficultyLabel({ difficulty, className = "" }: { difficulty: Difficulty; className?: string }) {
  const n = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft ${className}`}>
      <span aria-hidden className="inline-flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i <= n ? "bg-ink" : "bg-line-strong"}`} />
        ))}
      </span>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}

const alertStyles = {
  error: { cls: "border-red/25 bg-red-tint text-red", Icon: AlertCircle },
  success: { cls: "border-green/25 bg-green-tint text-green-strong", Icon: CheckCircle2 },
  warning: { cls: "border-amber/25 bg-amber-tint text-amber", Icon: TriangleAlert },
  info: { cls: "border-line bg-sunk text-ink-soft", Icon: Info },
};

export function Alert({
  tone = "info",
  title,
  children,
  className = "",
  role,
}: {
  tone?: keyof typeof alertStyles;
  title?: string;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const { cls, Icon } = alertStyles[tone];
  return (
    <div role={role ?? (tone === "error" ? "alert" : undefined)} className={`flex gap-3 rounded-[10px] border p-3.5 text-sm ${cls} ${className}`}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink-soft [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-muted">{icon}</div>}
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-[10px] bg-sunk ${className}`} />;
}

export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  if (url) {
    // Admin-moderated, https-only URLs; plain img avoids configuring remote image hosts.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full border border-line object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-green-tint font-semibold text-green-strong"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials}
    </span>
  );
}

export function PageHeader({ title, children, eyebrow }: { title: string; children?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <div className="mb-2 text-sm text-muted">{eyebrow}</div>}
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-muted">{children}</div>}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="tnum mt-1 font-display text-2xl font-semibold text-ink">{value}</dd>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
