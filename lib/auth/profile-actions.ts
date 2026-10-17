"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUser, getViewer } from "@/lib/auth/session";
import { displayNameSchema, fieldErrors, httpsUrlSchema, usernameSchema } from "@/lib/validation";
import { log } from "@/lib/errors/log";
import type { FormState } from "./actions";

const profileSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  avatarUrl: z.union([z.literal("").transform(() => null), httpsUrlSchema]),
  isPublic: z.boolean(),
});

/**
 * Updates the player's own editable profile fields. Runs as the player (RLS + column-level
 * grants allow only username, display_name, avatar_url and is_public on their own row).
 */
export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getAuthUser();
  if (!user) return { message: "Please sign in again." };
  const values = {
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    avatarUrl: String(formData.get("avatarUrl") ?? ""),
  };
  const parsed = profileSchema.safeParse({ ...values, isPublic: formData.get("isPublic") === "on" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      username: parsed.data.username,
      display_name: parsed.data.displayName,
      avatar_url: parsed.data.avatarUrl,
      is_public: parsed.data.isPublic,
    })
    .eq("id", user.id);
  if (error) {
    if (error.code === "23505") return { fieldErrors: { username: "That username is taken." }, values };
    if (error.message.includes("username_reserved")) return { fieldErrors: { username: "That username is reserved." }, values };
    await log("error", "profile.update_failed", { code: error.code });
    return { message: "We couldn't save your profile. Please try again.", values };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

/**
 * Permanently deletes the account. Attempts, results and practice records cascade with the
 * auth user; the player must type their username to confirm.
 */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Please sign in again." };
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== viewer.username) {
    return { fieldErrors: { confirm: `Type ${viewer.username} to confirm.` } };
  }
  const { error } = await createServiceClient().auth.admin.deleteUser(viewer.id);
  if (error) {
    await log("error", "account.delete_failed", { error: error.message });
    return { message: "We couldn't delete your account. Please contact us via the feedback form." };
  }
  await log("info", "account.deleted", {});
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?account=deleted");
}
