import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  supabaseSecretKey: z.string().min(20),
  cronSecret: z.string().min(32).optional(),
  aiApiKey: z.string().min(10).optional(),
  aiModel: z.string().min(3),
  advertisingEnabled: z.boolean(),
  adProvider: z.string().optional(),
  adPublisherId: z.string().optional(),
  isProduction: z.boolean(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Server-only configuration. Throws a descriptive error when a required value is missing. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    // New Supabase "secret" keys (sb_secret_...) are preferred; the legacy service_role JWT works too.
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    cronSecret: process.env.CRON_SECRET || undefined,
    aiApiKey: process.env.AI_PROVIDER_API_KEY || undefined,
    aiModel: process.env.AI_MODEL || "claude-sonnet-5-5",
    advertisingEnabled: process.env.ADVERTISING_ENABLED === "true",
    adProvider: process.env.AD_PROVIDER || undefined,
    adPublisherId: process.env.AD_PUBLISHER_ID || undefined,
    isProduction: process.env.NODE_ENV === "production",
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Pricele server configuration is invalid (${fields}). Set SUPABASE_SECRET_KEY ` +
        "(or SUPABASE_SERVICE_ROLE_KEY). CRON_SECRET must be at least 32 characters when set.",
    );
  }
  cached = parsed.data;
  return cached;
}
