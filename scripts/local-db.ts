/**
 * LOCAL DEVELOPMENT ONLY: creates a plain-PostgreSQL database that mimics the parts of
 * Supabase Pricele needs (tests/db/supabase-shim.sql), applies every migration and the
 * development seed, and sets the pricele_app password.
 *
 *   LOCAL_DATABASE_ADMIN_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run db:local
 *
 * For a real Supabase project use `supabase db push` instead (see README).
 */
import postgres from "postgres";
import { applySchema } from "../tests/db/harness";

const adminUrl = process.env.LOCAL_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const dbName = process.env.LOCAL_DATABASE_NAME ?? "pricele_dev";

async function main() {
  const host = new URL(adminUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`Refusing to run against non-local host ${host}`);
  }
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
  if (exists.length && !process.argv.includes("--reset")) {
    console.log(`Database ${dbName} already exists. Pass --reset to recreate it.`);
    await admin.end();
    return;
  }
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.unsafe(`create database ${dbName}`);
  await admin.end();
  const u = new URL(adminUrl);
  u.pathname = `/${dbName}`;
  await applySchema(u.toString(), { seed: true });
  const app = new URL(u.toString());
  app.username = "pricele_app";
  app.password = "pricele_app_local_test";
  console.log(`Created ${dbName}.`);
  console.log(`DATABASE_URL=${app.toString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
