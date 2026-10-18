/** The one-paste setup file must stay in sync with the migrations and work on an empty database. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { ADMIN_URL } from "../db/harness";

const root = join(__dirname, "..", "..");

describe("supabase/setup.sql", () => {
  it("is up to date with the migrations and seed", () => {
    const before = readFileSync(join(root, "supabase", "setup.sql"), "utf8");
    execFileSync("npx", ["tsx", "scripts/build-setup-sql.ts"], { cwd: root, stdio: "ignore" });
    expect(readFileSync(join(root, "supabase", "setup.sql"), "utf8")).toBe(before);
  });

  it("sets up an empty project in one run and returns a working app password", async () => {
    const name = `pricele_setup_${randomBytes(4).toString("hex")}`;
    const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
    await admin.unsafe(`create database ${name}`);
    const u = new URL(ADMIN_URL);
    u.pathname = `/${name}`;
    const owner = postgres(u.toString(), { max: 1, onnotice: () => {} });
    try {
      await owner.unsafe(readFileSync(join(root, "tests", "db", "supabase-shim.sql"), "utf8"));
      const results = (await owner.unsafe(readFileSync(join(root, "supabase", "setup.sql"), "utf8")).simple()) as unknown as postgres.Row[][];
      const last = results[results.length - 1];
      const { app_password, cron_secret } = last[0];
      expect(app_password).toMatch(/^[0-9a-f]{48}$/);
      expect(cron_secret).toMatch(/^[0-9a-f]{48}$/);

      const [{ n }] = await owner`select count(*)::int as n from public.questions where slug like 'starter-%' and image_url like '/items/%'`;
      expect(n).toBe(15);

      const appUrl = new URL(u.toString());
      appUrl.username = "pricele_app";
      appUrl.password = app_password;
      const app = postgres(appUrl.toString(), { max: 1, onnotice: () => {} });
      try {
        const [{ d }] = await app`select pricele.current_game_date()::text as d`;
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      } finally {
        await app.end();
      }
    } finally {
      await owner.end();
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
      // pricele_app is cluster-wide; restore the password other test files rely on.
      await postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
        .unsafe(`alter role pricele_app with password 'pricele_app_local_test'`)
        .then(() => undefined);
    }
  });
});
