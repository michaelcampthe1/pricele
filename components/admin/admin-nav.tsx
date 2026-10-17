"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/daily-sets", label: "Daily sets" },
  { href: "/admin/sources", label: "Sources and reports" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {ITEMS.map((i) => {
          const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px block border-b-2 px-3 py-2.5 text-sm font-medium ${
                  active ? "border-green text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
