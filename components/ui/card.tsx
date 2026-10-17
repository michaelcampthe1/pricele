import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[var(--radius-lg)] border border-border bg-surface shadow-card", className)}
      {...props}
    />
  );
}
