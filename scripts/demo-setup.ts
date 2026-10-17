/**
 * LOCAL DEMO ONLY. Makes the starter questions playable on a local database:
 * creates a demo admin in the local auth shim, verifies/approves the starter questions, and
 * publishes one set per day for the four days before today plus today (one set per entry in
 * supabase/starter-questions.json "days"). Refuses to run against any non-local host.
 *
 * In production, an editor verifies each starter question by hand in the admin dashboard.
 *
 *   LOCAL_OWNER_URL=postgres://postgres:postgres@127.0.0.1:5432/pricele_dev npm run demo:setup
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { addDays, gameDateFor, gameDayStartUtc } from "../lib/dates";

const ownerUrl = process.env.LOCAL_OWNER_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/pricele_dev";
const DEMO_EMAIL = "demo-admin@pricele.local";
const starter = JSON.parse(readFileSync(join(__dirname, "..", "supabase", "starter-questions.json"), "utf8")) as {
  days: [string, string, string][];
};

async function main() {
  const host = new URL(ownerUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`Refusing to run against non-local host ${host}`);
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    const [shim] = await sql`select to_regclass('auth.identities') is null as is_shim`;
    if (!shim.is_shim) throw new Error("This looks like a real Supabase database. The demo script only runs on the local shim.");

    await sql`insert into auth.users (email, raw_user_meta_data) values (${DEMO_EMAIL}, ${sql.json({ username: "demo_admin" })})
              on conflict (email) do nothing`;
    const [{ r: boot }] = await sql`select pricele.bootstrap_admin(${DEMO_EMAIL}, true) as r`;
    const adminId: string = boot.userId;

    const starters = await sql`select id, slug, status from public.questions where slug like 'starter-%'`;
    const bySlug = new Map(starters.map((q) => [q.slug as string, q]));
    for (const q of starters) {
      if (q.status === "draft") {
        const [{ r: v }] = await sql`select pricele.admin_verify_answer(${adminId}::uuid, ${q.id}::uuid, true) as r`;
        if (!v.ok) throw new Error(`verify ${q.slug}: ${JSON.stringify(v)}`);
        await sql`select pricele.admin_set_question_status(${adminId}::uuid, ${q.id}::uuid, 'approve')`;
      }
    }

    const today = gameDateFor();
    // days[0] is today, days[1] yesterday, and so on.
    for (let i = starter.days.length - 1; i >= 0; i--) {
      const day = addDays(today, -i);
      const [existing] = await sql`select id, status from public.daily_sets where game_date = ${day}`;
      if (existing && existing.status !== "draft") continue;
      const noon = new Date(gameDayStartUtc(day).getTime() + 12 * 3600 * 1000).toISOString();
      await sql`select set_config('pricele.test_now', ${noon}, false)`;
      const setId: string =
        existing?.id ?? (await sql`select pricele.admin_create_daily_set(${adminId}::uuid, ${day}::date) as r`)[0].r.id;
      for (const slug of starter.days[i]) {
        const q = bySlug.get(slug);
        if (!q) throw new Error(`Missing starter question ${slug}`);
        const [{ r: a }] = await sql`select pricele.admin_assign_question(${adminId}::uuid, ${setId}::uuid, ${q.id}::uuid) as r`;
        if (!a.ok && a.error !== "question_already_used") throw new Error(`assign ${slug}: ${JSON.stringify(a)}`);
      }
      const [{ r: pub }] = await sql`select pricele.admin_publish_daily_set(${adminId}::uuid, ${setId}::uuid, true) as r`;
      if (!pub.ok) throw new Error(`publish ${day}: ${JSON.stringify(pub)}`);
      await sql`select set_config('pricele.test_now', '', false)`;
      console.log(`Published set for ${day} (${pub.status})`);
    }
    console.log(`Demo admin: ${DEMO_EMAIL} (local auth shim only).`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
