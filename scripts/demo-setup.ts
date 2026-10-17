/**
 * LOCAL DEMO ONLY. Makes the fictional sample questions playable on a local database:
 * creates a demo admin in the local auth shim, verifies/approves the sample questions
 * (they are fictional and labeled "Sample question"), and publishes sets for the past
 * six days, today and tomorrow. Refuses to run against any non-local host.
 *
 *   LOCAL_OWNER_URL=postgres://postgres:postgres@127.0.0.1:5432/pricele_dev npm run demo:setup
 */
import postgres from "postgres";
import { addDays, gameDateFor, gameDayStartUtc } from "../lib/dates";

const ownerUrl = process.env.LOCAL_OWNER_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/pricele_dev";
const DEMO_EMAIL = "demo-admin@pricele.local";

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

    const samples = await sql`
      select q.id, q.slug, q.difficulty, q.status from public.questions q where q.is_sample order by q.slug`;
    for (const q of samples) {
      if (q.status === "draft") {
        const [{ r: v }] = await sql`select pricele.admin_verify_answer(${adminId}::uuid, ${q.id}::uuid, true) as r`;
        if (!v.ok) throw new Error(`verify ${q.slug}: ${JSON.stringify(v)}`);
        await sql`select pricele.admin_set_question_status(${adminId}::uuid, ${q.id}::uuid, 'approve')`;
      }
    }

    const today = gameDateFor();
    const days = Array.from({ length: 8 }, (_, i) => addDays(today, i - 6));
    for (const day of days) {
      const [existing] = await sql`select id, status from public.daily_sets where game_date = ${day}`;
      if (existing && existing.status !== "draft") continue;
      const noon = new Date(gameDayStartUtc(day).getTime() + 12 * 3600 * 1000).toISOString();
      await sql`select set_config('pricele.test_now', ${noon}, false)`;
      const setId: string =
        existing?.id ?? (await sql`select pricele.admin_create_daily_set(${adminId}::uuid, ${day}::date) as r`)[0].r.id;
      for (const difficulty of ["easy", "medium", "hard"]) {
        const [q] = await sql`
          select q.id from public.questions q
           where q.is_sample and q.status = 'approved' and q.difficulty = ${difficulty}
             and not exists (select 1 from public.daily_set_questions d where d.question_id = q.id)
           order by q.slug limit 1`;
        if (!q) throw new Error(`Ran out of sample ${difficulty} questions`);
        await sql`select pricele.admin_assign_question(${adminId}::uuid, ${setId}::uuid, ${q.id}::uuid)`;
      }
      const [{ r: pub }] = await sql`select pricele.admin_publish_daily_set(${adminId}::uuid, ${setId}::uuid, true) as r`;
      if (!pub.ok) throw new Error(`publish ${day}: ${JSON.stringify(pub)}`);
      await sql`select set_config('pricele.test_now', '', false)`;
      console.log(`Published sample set for ${day} (${pub.status})`);
    }
    console.log(`Demo admin: ${DEMO_EMAIL} (local auth shim only; cannot sign in without Supabase Auth).`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
