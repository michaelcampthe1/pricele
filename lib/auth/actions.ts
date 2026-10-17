"use server";

import { unstable_rethrow } from "next/navigation";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appUrl, isSupabaseConfigured } from "@/lib/env";
import { emailSchema, fieldErrors, passwordSchema, usernameSchema } from "@/lib/validation";
import { safeNextPath } from "@/lib/auth/redirect";
import { readGuestHash } from "@/lib/auth/guest";
import { guestSummary, isUsernameAvailable, rateLimit } from "@/lib/game/service";
import { clientKey } from "@/lib/request";
import { logger } from "@/lib/logger";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

const NOT_CONFIGURED: AuthFormState = {
  error: "Sign-in isn't available yet: this deployment's Supabase Auth settings are missing.",
};

async function limited(action: string, max = 10, windowSeconds = 300): Promise<boolean> {
  try {
    return !(await rateLimit(`auth:${action}:${await clientKey()}`, windowSeconds, max));
  } catch (err) {
    unstable_rethrow(err);
    logger.warn("auth.rate_limit_unavailable", { error: String(err) });
    return false;
  }
}

/** Where to go after authentication: the explicit claim step when guest progress exists. */
async function postAuthDestination(next: string): Promise<string> {
  const hash = await readGuestHash();
  if (hash) {
    try {
      const summary = await guestSummary(hash);
      if (summary.valid && summary.attempts > 0) return `/claim?next=${encodeURIComponent(next)}`;
    } catch (err) {
    unstable_rethrow(err);
      logger.warn("auth.guest_summary_failed", { error: String(err) });
    }
  }
  return next;
}

const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(72) });

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const next = safeNextPath(formData.get("next"), "/play");
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (await limited("signin")) return { error: "Too many attempts. Wait a few minutes and try again.", values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email address first — check your inbox for the link.", values };
    }
    return { error: "That email and password combination didn't work.", values };
  }
  redirect(await postAuthDestination(next));
}

const signUpSchema = z.object({ email: emailSchema, password: passwordSchema, username: usernameSchema });

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const next = safeNextPath(formData.get("next"), "/play");
  const values = { email: String(formData.get("email") ?? ""), username: String(formData.get("username") ?? "") };
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    username: formData.get("username"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (await limited("signup", 5, 600)) return { error: "Too many sign-up attempts. Try again in a few minutes.", values };

  if (!(await isUsernameAvailable(parsed.data.username))) {
    return { fieldErrors: { username: "That username is taken." }, values };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { username: parsed.data.username },
      emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(`/claim?next=${encodeURIComponent(next)}`)}`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return { fieldErrors: { password: "Choose a stronger password." }, values };
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: "Too many emails sent recently. Try again later.", values };
    }
    if (error.code !== "user_already_exists" && error.code !== "email_exists") {
      logger.warn("auth.signup_failed", { code: error.code, status: error.status });
      return { error: "We couldn't create your account. Try again in a moment.", values };
    }
    // Don't reveal whether an email already has an account.
  }
  if (data?.session) redirect(await postAuthDestination(next));
  return {
    message: "Check your email for a confirmation link. If you already have an account, sign in instead.",
    values,
  };
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/login?error=not_configured");
  const next = safeNextPath(formData.get("next"), "/play");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    logger.warn("auth.oauth_start_failed", { code: error?.code });
    redirect("/login?error=oauth");
  }
  redirect(data.url);
}

export async function requestPasswordResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address." } };
  if (await limited("reset", 5, 900)) return { error: "Too many requests. Try again later." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  });
  if (error) logger.warn("auth.reset_failed", { code: error.code, status: error.status });
  // Same response whether or not the account exists.
  return { message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0].message } };
  if (formData.get("password") !== formData.get("confirm")) {
    return { fieldErrors: { confirm: "Passwords don't match." } };
  }
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Choose a password you haven't used here." } };
    return { error: "We couldn't update your password. Request a new reset link." };
  }
  redirect("/profile?password=updated");
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
