import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M9 10.5A1.5 1.5 0 0 1 10.5 9h7.38a1.5 1.5 0 0 1 1.06.44l4.62 4.62a1.5 1.5 0 0 1 0 2.12l-7.38 7.38a1.5 1.5 0 0 1-2.12 0l-4.62-4.62A1.5 1.5 0 0 1 9 17.88z"
        fill="#fff"
      />
      <circle cx="13.5" cy="13.5" r="1.6" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[19px] font-semibold tracking-[-0.02em] text-ink">Pricele</span>
    </span>
  );
}
