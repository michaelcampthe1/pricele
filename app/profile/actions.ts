"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getFreshUser, getSessionUser } from "@/lib/auth/session";
import { deleteAccount, rateLimit, updateProfile, updateUsername } from "@/lib/game/service";
import { avatarUrlSchema, displayNameSchema, fieldErrors, usernameSchema } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export type ProfileFormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

const profileSchema = z.object({
  displayName: displayNameSchema,
  avatarUrl: avatarUrlSchema,
  isPublic: z.boolean(),
});

export async function updateProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in again to update your profile." };
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
    isPublic: formData.get("isPublic") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const r = await updateProfile(user.id, parsed.data);
  if (!r.ok) return { error: "We couldn't save those changes." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateUsernameAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in again to change your username." };
  const parsed = usernameSchema.safeParse(formData.get("username"));
  if (!parsed.success) return { fieldErrors: { username: parsed.error.issues[0].message } };
  if (!(await rateLimit(`username:${user.id}`, 3600, 5))) return { error: "You've changed your username several times. Try again later." };
  const r = await updateUsername(user.id, parsed.data);
  if (!r.ok) {
    return { fieldErrors: { username: r.error === "username_taken" ? "That username is taken." : "That username isn't allowed." } };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAccountAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await getFreshUser();
  if (!user) return { error: "Sign in again to delete your account." };
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete my account") {
    return { fieldErrors: { confirm: 'Type "delete my account" to confirm.' } };
  }
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    await deleteAccount(user.id);
    logger.info("account.deleted", {});
  } catch (err) {
    unstable_rethrow(err);
    logger.error("account.delete_failed", { error: String(err) });
    return { error: "We couldn't delete your account. Contact support." };
  }
  redirect("/?deleted=1");
}
