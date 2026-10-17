import type { ReactNode } from "react";
import { Alert } from "@/components/ui/misc";
import { isSupabaseConfigured } from "@/lib/env";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      <div className="mt-8 space-y-5 rounded-[16px] border border-line bg-surface p-5 sm:p-7">
        {!isSupabaseConfigured() && (
          <Alert tone="warning" title="Accounts aren't configured on this deployment">
            The operator needs to set the Supabase URL and publishable key. You can still play today&apos;s game as a guest.
          </Alert>
        )}
        {children}
      </div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
