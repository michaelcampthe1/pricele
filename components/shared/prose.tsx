import type { ReactNode } from "react";

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 [&_a]:text-green-strong [&_a]:underline [&_h1]:font-display [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-ink-soft [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-ink-soft">
      {children}
    </div>
  );
}

export function DraftNotice() {
  return (
    <p className="!mt-6 rounded-[10px] border border-amber/30 bg-amber-tint p-3 text-sm !text-amber">
      Starter text describing how this software works. It must be reviewed and completed by the operator (and ideally a lawyer)
      before public launch, including the operator&apos;s legal name, jurisdiction and contact details.
    </p>
  );
}
