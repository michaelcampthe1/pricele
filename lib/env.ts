import { z } from "zod";

/**
 * Environment configuration.
 *
 * Public values are referenced with literal `process.env.NEXT_PUBLIC_*` expressions so that
 * Next.js can inline them into client bundles. Server values are only read from server code
 * (see lib/env.server.ts) and must never use the NEXT_PUBLIC_ prefix.
 */
const publicSchema = z.object({
  appUrl: z.string().url(),
  supabaseUrl: z.string().url(),
  supabasePublishableKey: z.string().min(20),
  googleAuthEnabled: z.boolean(),
  contactEmail: z.string().email().optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | null = null;

export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicSchema.safeParse({
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // Current Supabase projects issue "publishable" keys; the legacy anon JWT also works.
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    googleAuthEnabled: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true",
    contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Pricele is missing or has invalid public configuration (${missing}). ` +
        "Copy .env.example to .env.local and fill in NEXT_PUBLIC_APP_URL, " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  cached = parsed.data;
  return cached;
}
