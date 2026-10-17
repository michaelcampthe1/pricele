"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/security/redirect";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientKey } from "@/lib/security/request";
import { emailSchema, fieldErrors, passwordSchema, usernameSchema } from "@/lib/validation";
import { log } from "@/lib/errors/log";

export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const RATE_LIMITED: FormState = { message: "Too many attempts. Please wait a few minutes and try again." };

function callbackUrl(next: string) {
  return `${publicEnv().appUrl}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    email: String(formData.get("email") ?? ""),
    username: String(formData.get("username") ?? ""),
  };
  const next = safeNextPath(formData.get("next"), "/");
  const parsed = z
    .object({ email: emailSchema, username: usernameSchema, password: passwordSchema })
    .safeParse({ ...values, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (!(await rateLimit("auth", await clientKey()))) return { ...RATE_LIMITED, values };

  const { data: taken } = await createServiceClient()
    .from("profiles")
    .select("id")
    .eq("username", parsed.data.username)
    .maybeSingle();
  if (taken) return { fieldErrors: { username: "That username is taken." }, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { username: parsed.data.username }, emailRedirectTo: callbackUrl(next) },
  });
  if (error) {
    await log("warn", "auth.signup_failed", { code: error.code, status: error.status });
    if (error.code === "weak_password") return { fieldErrors: { password: "Choose a stronger password." }, values };
    // Deliberately generic: don't reveal whether the email already has an account.
    return {
      message: "We couldn't create an account with those details. If you already have an account, sign in or reset your password.",
      values,
    };
  }
  if (data.session) redirect(next);
  return {
    ok: true,
    message: "Check your email for a confirmation link to finish creating your account.",
  };
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") };
  const next = safeNextPath(formData.get("next"), "/");
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, "Enter your password.") })
    .safeParse({ ...values, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (!(await rateLimit("auth", await clientKey()))) return { ...RATE_LIMITED, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { message: "Please confirm your email address first — check your inbox for the link.", values };
    }
    return { message: "Incorrect email or password.", values };
  }
  redirect(next);
}

export async function signInWithGoogleAction(formData: FormData) {
  if (!publicEnv().googleAuthEnabled) redirect("/login?error=google_disabled");
  const next = safeNextPath(formData.get("next"), "/");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(next) },
  });
  if (error || !data.url) {
    await log("error", "auth.google_failed", { error: error?.message });
    redirect("/login?error=oauth");
  }
  redirect(data.url);
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = emailSchema.safeParse(values.email);
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message }, values };
  if (!(await rateLimit("passwordReset", await clientKey()))) return { ...RATE_LIMITED, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: callbackUrl("/reset-password"),
  });
  if (error) await log("warn", "auth.reset_request_failed", { code: error.code });
  // Same response either way, so the form can't be used to discover accounts.
  return { ok: true, message: "If an account exists for that email, we've sent a link to reset your password." };
}

export async function updatePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0].message } };
  if (password !== confirm) return { fieldErrors: { confirm: "Passwords don't match." } };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { message: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    return { message: error.code === "same_password" ? "Choose a password you haven't used here before." : "We couldn't update your password. Try again." };
  }
  redirect("/profile?password=updated");
}
