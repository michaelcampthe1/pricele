"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/play", label: "Today's game" },
  { href: "/archive", label: "Archive" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/play" && pathname === "/results");
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-[15px] font-medium transition-colors ${
                active ? "text-ink underline decoration-green decoration-2 underline-offset-[10px]" : "text-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
