/**
 * Integration-test database harness (local PostgreSQL only — never production).
 * Creates an isolated database, applies the Supabase shim + every migration in order,
 * and exposes an owner connection (for fixtures/assertions) and a pricele_app connection
 * (the same least-privilege role the Next.js server uses).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

export const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const APP_PASSWORD = "pricele_app_local_test";

const root = join(__dirname, "..", "..");

export function migrationFiles(): string[] {
  const dir = join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));
}

function withDatabase(url: string, db: string) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

function withUser(url: string, user: string, password: string) {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

export async function applySchema(ownerUrl: string, opts: { seed?: boolean } = {}) {
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(readFileSync(join(root, "tests", "db", "supabase-shim.sql"), "utf8"));
    for (const file of migrationFiles()) {
      await sql.unsafe(readFileSync(file, "utf8"));
    }
    await sql.unsafe(`alter role pricele_app with login password '${APP_PASSWORD}'`);
    if (opts.seed) {
      await sql.unsafe(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
    }
  } finally {
    await sql.end();
  }
}

export type TestDb = {
  name: string;
  ownerUrl: string;
  appUrl: string;
  owner: postgres.Sql;
  /** Moves the database clock used by pricele.now(); resets pooled app connections. */
  setNow(isoTimestamp: string | null): Promise<void>;
  drop(): Promise<void>;
};

export async function createTestDb(prefix = "pricele_it"): Promise<TestDb> {
  const name = `${prefix}_${randomBytes(4).toString("hex")}`;
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  await admin.end();

  const ownerUrl = withDatabase(ADMIN_URL, name);
  await applySchema(ownerUrl);
  const appUrl = withUser(ownerUrl, "pricele_app", APP_PASSWORD);
  const connectOwner = () => postgres(ownerUrl, { max: 4, onnotice: () => {} });
  let owner = connectOwner();

  return {
    name,
    ownerUrl,
    appUrl,
    get owner() {
      return owner;
    },
    async setNow(ts) {
      await owner.end({ timeout: 1 });
      const { resetSqlForTests: resetApp } = await import("@/lib/db");
      await resetApp();
      // Change the setting from a connection to another database, then end every session on the
      // test database (including the owner pool) so all reconnect with the new clock.
      const ctl = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
      try {
        if (ts) await ctl.unsafe(`alter database ${name} set pricele.test_now = '${new Date(ts).toISOString()}'`);
        else await ctl.unsafe(`alter database ${name} reset pricele.test_now`);
        await ctl.unsafe(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${name}'`);
        // Wait until terminated sessions are fully gone before anyone reconnects.
        for (let i = 0; i < 50; i++) {
          const [{ n }] = await ctl.unsafe(`select count(*)::int as n from pg_stat_activity where datname = '${name}'`);
          if (n === 0) break;
          await new Promise((r) => setTimeout(r, 20));
        }
      } finally {
        await ctl.end();
      }
      owner = connectOwner();
    },
    async drop() {
      await owner.end({ timeout: 1 });
      const { resetSqlForTests } = await import("@/lib/db");
      await resetSqlForTests();
      const a = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
      await a.unsafe(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}
