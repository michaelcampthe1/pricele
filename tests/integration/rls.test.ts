/**
 * Row-level security and privilege tests. These run SQL as the Supabase API roles
 * (anon / authenticated) exactly as PostgREST would, to prove the Data API can't leak
 * answer keys or let players write authoritative data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createTestDb, type TestDb } from "../db/harness";
import { createAdmin, createUser, noonEt, playSet, publishSet } from "../db/fixtures";

let db: TestDb;
let adminId: string;
let today: { setId: string; questionIds: [string, string, string] };
let future: { setId: string; questionIds: [string, string, string] };
let player: string;

async function as<T>(role: "anon" | "authenticated", sub: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return db.owner.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    if (sub) await tx`select set_config('request.jwt.claim.sub', ${sub}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.appUrl;
  adminId = await createAdmin(db);
  future = await publishSet(db, adminId, "2026-10-17", undefined, { nowAfter: noonEt("2026-10-16") });
  today = await publishSet(db, adminId, "2026-10-16");
  player = await createUser(db, "rlsplayer");
  await playSet(player, null, today.questionIds.slice(0, 1), ["100"]);
});

afterAll(async () => {
  await db?.drop();
});

describe("anonymous visitors", () => {
  it("cannot read answer keys or sources", async () => {
    await expect(as("anon", null, (tx) => tx`select * from public.question_answers`)).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, (tx) => tx`select * from public.question_sources`)).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, (tx) => tx`select * from public.official_attempts`)).rejects.toThrow(/permission denied/);
  });

  it("see only live questions (today and earlier), never future or draft content", async () => {
    const rows = await as("anon", null, (tx) => tx`select id from public.questions`);
    const ids = rows.map((r) => r.id);
    expect(ids.sort()).toEqual([...today.questionIds].sort());
    for (const id of future.questionIds) expect(ids).not.toContain(id);
    const sets = await as("anon", null, (tx) => tx`select game_date::text as d from public.daily_sets`);
    expect(sets).toEqual([{ d: "2026-10-16" }]);
  });

  it("cannot select hidden columns or write anything", async () => {
    await expect(as("anon", null, (tx) => tx`select created_by from public.questions`)).rejects.toThrow(/permission denied/);
    await expect(
      as("anon", null, (tx) => tx`insert into public.categories (name, slug) values ('Hack', 'hack')`),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot execute privileged functions", async () => {
    await expect(
      as("anon", null, (tx) => tx`select pricele.submit_official_guess(null, null, ${today.questionIds[1]}::uuid, 5)`),
    ).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, (tx) => tx`select pricele.reveal_payload(${today.questionIds[1]}::uuid)`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot see private profiles", async () => {
    await db.owner`update public.profiles set is_public = false where id = ${player}`;
    const rows = await as("anon", null, (tx) => tx`select username from public.profiles where id = ${player}`);
    expect(rows).toHaveLength(0);
    await db.owner`update public.profiles set is_public = true where id = ${player}`;
  });
});

describe("authenticated players", () => {
  it("cannot read answer keys directly", async () => {
    await expect(as("authenticated", player, (tx) => tx`select * from public.question_answers`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("read only their own attempts and results", async () => {
    const other = await createUser(db);
    const mine = await as("authenticated", player, (tx) => tx`select user_id from public.official_attempts`);
    expect(mine.every((r) => r.user_id === player)).toBe(true);
    expect(mine).toHaveLength(1);
    const theirs = await as("authenticated", other, (tx) => tx`select * from public.official_attempts`);
    expect(theirs).toHaveLength(0);
  });

  it("cannot insert attempts, change scores, edit profiles directly, or grant roles", async () => {
    await expect(
      as(
        "authenticated",
        player,
        (tx) => tx`insert into public.official_attempts (daily_set_id, question_id, user_id, guess_amount, answer_snapshot, score, absolute_percentage_error, scoring_version)
                   values (${today.setId}, ${today.questionIds[1]}, ${player}, 1, 1, 1000, 0, 'x')`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", player, (tx) => tx`update public.official_attempts set score = 1000`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(as("authenticated", player, (tx) => tx`update public.daily_results set total_score = 3000`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(as("authenticated", player, (tx) => tx`update public.profiles set username = 'hijack'`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as("authenticated", player, (tx) => tx`insert into public.user_roles (user_id, role) values (${player}, 'admin')`),
    ).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", player, (tx) => tx`select * from public.user_roles`)).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", player, (tx) => tx`select * from public.guest_sessions`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("is not an admin unless granted through the controlled bootstrap", async () => {
    const [{ r }] = await db.owner`select pricele.is_admin(${player}::uuid) as r`;
    expect(r).toBe(false);
    const [{ a }] = await db.owner`select pricele.is_admin(${adminId}::uuid) as a`;
    expect(a).toBe(true);
  });
});

describe("function hardening", () => {
  it("every SECURITY DEFINER function pins an empty search_path", async () => {
    const rows = await db.owner`
      select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'pricele' and p.prosecdef`;
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) expect(r.proconfig ?? [], r.proname).toContain('search_path=""');
  });

  it("no pricele function is executable by PUBLIC except the RLS helpers", async () => {
    const rows = await db.owner`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'pricele' and has_function_privilege('anon', p.oid, 'execute')`;
    expect(rows.map((r) => r.proname).sort()).toEqual(["current_game_date", "is_question_live", "is_set_live", "now"]);
  });

  it("RLS is enabled on every public table", async () => {
    const rows = await db.owner`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(rows).toEqual([]);
  });
});
