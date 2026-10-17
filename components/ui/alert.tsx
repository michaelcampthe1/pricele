import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "error";

const tones: Record<Tone, { cls: string; Icon: typeof Info }> = {
  info: { cls: "bg-surface-muted text-ink-soft border-border", Icon: Info },
  success: { cls: "bg-accent-soft text-accent-strong border-accent/20", Icon: CheckCircle2 },
  warning: { cls: "bg-warning-soft text-warning border-warning/20", Icon: TriangleAlert },
  error: { cls: "bg-error-soft text-error border-error/20", Icon: AlertCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const { cls, Icon } = tones[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-[var(--radius)] border px-4 py-3 text-sm", cls, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
