import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getFreshUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/admin/service";

/**
 * Server-side admin gate for pages, server actions and API routes. Non-admins get a 404
 * so the dashboard's existence isn't advertised. The database re-checks the role inside
 * every admin function as defense in depth.
 */
const resolveAdmin = cache(async () => {
  const user = await getFreshUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user;
});

export async function requireAdmin(): Promise<{ id: string; email: string | null }> {
  const user = await resolveAdmin();
  if (!user) notFound();
  return user;
}

/** Variant for server actions that must return an error instead of throwing a 404. */
export async function adminOrNull(): Promise<{ id: string; email: string | null } | null> {
  const user = await getFreshUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user;
}
