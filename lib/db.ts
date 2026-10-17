import "server-only";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";

/**
 * Server-only PostgreSQL client.
 *
 * Connects as the least-privilege `pricele_app` role, which can only EXECUTE functions in
 * the private `pricele` schema (no direct table access). Use the Supabase *transaction
 * pooler* connection string in serverless deployments; prepared statements are disabled
 * for pooler compatibility.
 */

type GlobalWithSql = typeof globalThis & { __priceleSql?: postgres.Sql };
const g = globalThis as GlobalWithSql;

export function sql(): postgres.Sql {
  if (!g.__priceleSql) {
    const url = serverEnv().DATABASE_URL;
    const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
    g.__priceleSql = postgres(url, {
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: isLocal ? false : "require",
      onnotice: () => {},
      connection: { application_name: "pricele-web" },
    });
  }
  return g.__priceleSql;
}

/** Test helper: closes the pooled client so the next call reconnects. */
export async function resetSqlForTests() {
  const existing = g.__priceleSql;
  g.__priceleSql = undefined;
  if (existing) await existing.end({ timeout: 1 }).catch(() => {});
}
