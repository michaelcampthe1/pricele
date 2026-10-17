import { cn } from "@/lib/cn";

/** Avatar image when provided, otherwise initials. Decorative: names are always shown alongside. */
export function Avatar({ name, url, size = 32, className }: { name: string; url?: string | null; size?: number; className?: string }) {
  const initials = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-[11px] font-semibold text-accent-strong", className)}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied https avatar; not optimized
        <img src={url} alt="" width={size} height={size} className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials
      )}
    </span>
  );
}
