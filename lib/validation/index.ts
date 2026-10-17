import { z } from "zod";
import { isValidGameDate } from "@/lib/dates";

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "pricele", "support", "root", "system", "moderator", "mod",
  "staff", "null", "undefined", "me", "settings", "api", "help", "official", "team",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, "Usernames are 3–20 characters: lowercase letters, numbers and underscores.")
  .refine((u) => !RESERVED_USERNAMES.has(u), "That username is reserved.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[a-zA-Z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const uuidSchema = z.string().uuid();

export const gameDateSchema = z.string().refine(isValidGameDate, "Invalid date.");

export const displayNameSchema = z
  .string()
  .trim()
  .max(40, "Display names are at most 40 characters.")
  .transform((v) => (v === "" ? null : v));

export const httpsUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !/\s/.test(v);
    } catch {
      return false;
    }
  }, "Enter a full https:// URL.");

export const sourceUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && !/\s/.test(v);
    } catch {
      return false;
    }
  }, "Enter a full http(s):// URL.");

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
