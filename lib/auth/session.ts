import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type AuthUser = { id: string; email: string | null };

/**
 * The verified signed-in user for this request, or null. Uses getClaims(), which validates
 * the JWT signature (never trusts an unverified cookie). Memoized per request.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
});

export type ViewerProfile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  usernameConfirmed: boolean;
  suspended: boolean;
  isAdmin: boolean;
  createdAt: string;
};

/** Signed-in user's own profile (including private flags), read with trusted server access. */
export const getViewer = cache(async (): Promise<ViewerProfile | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const svc = createServiceClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    svc
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_public, username_confirmed, suspended_at, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    svc.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    isPublic: profile.is_public,
    usernameConfirmed: profile.username_confirmed,
    suspended: profile.suspended_at !== null,
    isAdmin: (roles ?? []).some((r) => r.role === "admin"),
    createdAt: profile.created_at,
  };
});

export async function requireUser(next = "/profile"): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * Server-side administrator check against the user_roles table (never a client-editable
 * field). Every admin page, server action and route calls this.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !error && data !== null;
}

export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
  }
}

/** For server actions: returns the admin's user or throws. */
export async function assertAdmin(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user || !(await isAdmin(user.id))) throw new ForbiddenError();
  return user;
}
