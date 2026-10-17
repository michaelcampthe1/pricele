import { z } from "zod";

/**
 * Environment validation. Public values are safe to expose to the browser; everything
 * else is read only on the server. Validation runs at the point of use so that pages
 * which don't need a given integration keep working when it is not configured.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL" }),
  // Supabase publishable key (sb_publishable_...) or the legacy anon JWT. Both are safe in the browser.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
});

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// connection string for the pricele_app role"),
  CRON_SECRET: z.string().min(16).optional(),
  AI_PROVIDER_API_KEY: z.string().min(10).optional(),
  AI_MODEL: z.string().default("claude-sonnet-5-5"),
  ADVERTISING_ENABLED: z.enum(["true", "false"]).default("false"),
  AD_PROVIDER: z.string().optional(),
  AD_PUBLISHER_ID: z.string().optional(),
  GUEST_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
});

export class ConfigError extends Error {}

function format(error: z.ZodError) {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

let cachedPublic: z.infer<typeof publicSchema> | null = null;
export function publicEnv() {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) throw new ConfigError(`Missing or invalid public configuration — ${format(parsed.error)}`);
  cachedPublic = parsed.data;
  return cachedPublic;
}

let cachedServer: z.infer<typeof serverSchema> | null = null;
export function serverEnv() {
  if (typeof window !== "undefined") throw new ConfigError("serverEnv() must not be called in the browser");
  if (cachedServer) return cachedServer;
  const blankToUndefined = (v: string | undefined) => (v && v.trim() !== "" ? v : undefined);
  const parsed = serverSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    CRON_SECRET: blankToUndefined(process.env.CRON_SECRET),
    AI_PROVIDER_API_KEY: blankToUndefined(process.env.AI_PROVIDER_API_KEY),
    AI_MODEL: blankToUndefined(process.env.AI_MODEL),
    ADVERTISING_ENABLED: blankToUndefined(process.env.ADVERTISING_ENABLED),
    AD_PROVIDER: blankToUndefined(process.env.AD_PROVIDER),
    AD_PUBLISHER_ID: blankToUndefined(process.env.AD_PUBLISHER_ID),
    GUEST_SESSION_TTL_DAYS: blankToUndefined(process.env.GUEST_SESSION_TTL_DAYS),
  });
  if (!parsed.success) throw new ConfigError(`Missing or invalid server configuration — ${format(parsed.error)}`);
  cachedServer = parsed.data;
  return cachedServer;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
