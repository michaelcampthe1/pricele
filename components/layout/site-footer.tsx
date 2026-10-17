import Link from "next/link";
import { Wordmark } from "./logo";

const LINKS = [
  { href: "/about", label: "About Pricele" },
  { href: "/archive", label: "Archive" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/about#contact", label: "Contact & feedback" },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Wordmark />
          <p className="max-w-xs text-sm text-muted">Three prices. One guess each. A new game every day at midnight Eastern Time.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink-soft hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted sm:px-6">© {new Date().getFullYear()} Pricele</div>
    </footer>
  );
}
