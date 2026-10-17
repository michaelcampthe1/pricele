import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { LogoMark } from "@/components/layout/logo";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-16">
      <Card className="p-6 sm:p-8">
        <Link href="/" aria-label="Pricele home" className="inline-block">
          <LogoMark className="size-9" />
        </Link>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </Card>
      {footer ? <div className="mt-5 text-center text-sm text-muted">{footer}</div> : null}
    </div>
  );
}
