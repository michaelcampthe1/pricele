import { z } from "zod";

export const USERNAME_RULE = "3–20 characters: lowercase letters, numbers or underscores, starting with a letter.";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{2,19}$/, USERNAME_RULE);

export const emailSchema = z.email("Enter a valid email address.").trim().toLowerCase().max(254);

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.")
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Include at least one letter and one number.");

export const uuidSchema = z.uuid();

export const displayNameSchema = z
  .string()
  .trim()
  .max(40, "Use 40 characters or fewer.")
  .transform((v) => (v === "" ? null : v));

export const avatarUrlSchema = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v), "Use an https:// image URL.");

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
