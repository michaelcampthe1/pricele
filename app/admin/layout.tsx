import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthUser, isAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Pricele admin" }, robots: { index: false, follow: false } };

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/daily-sets", label: "Daily sets" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/users", label: "Users" },
];

/**
 * Server-side gate for every /admin page: signed in + admin role in user_roles. Non-admins
 * get a 404 so the dashboard's existence isn't advertised. Server actions re-check
 * independently (lib/admin/actions.ts) and the database functions check a third time.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await isAdmin(user.id))) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">Admin</p>
        <nav aria-label="Admin">
          <ul className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-surface-muted hover:text-ink">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {children}
    </div>
  );
}
