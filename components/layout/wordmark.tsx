/** The Pricele wordmark: a small price tag glyph and the name set in the display face. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7">
        <path
          d="M3 6.5A3.5 3.5 0 0 1 6.5 3h7.6a3.5 3.5 0 0 1 2.47 1.03l7.9 7.9a3.5 3.5 0 0 1 0 4.94l-7.6 7.6a3.5 3.5 0 0 1-4.94 0l-7.9-7.9A3.5 3.5 0 0 1 3 14.1Z"
          fill="var(--green)"
        />
        <circle cx="9" cy="9" r="2.2" fill="var(--paper)" />
        <path d="M12.5 17.5 18 12" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[22px] font-bold tracking-[-0.03em] text-ink">Pricele</span>
    </span>
  );
}
