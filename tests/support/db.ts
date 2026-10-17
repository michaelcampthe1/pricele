/**
 * Integration-test helpers. They talk to a LOCAL Supabase stack only and refuse to run
 * against anything else, so destructive fixtures can never touch production data.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/supabase/database.types";
import { getGameDate, addDays } from "@/lib/dates";

export type Db = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  throw new Error(`Refusing to run tests against non-local Supabase URL: ${url || "(unset)"}`);
}
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const service: Db = createClient<Database>(url, secret, opts);
export const anon = (): Db => createClient<Database>(url, publishable, opts);

export function today() {
  return getGameDate();
}
export { addDays };

export async function createUser(prefix = "player") {
  const tag = randomUUID().slice(0, 8);
  const email = `${prefix}-${tag}@pricele.test`;
  const password = `Passw0rd-${tag}`;
  const username = `${prefix.slice(0, 8)}_${tag}`.toLowerCase();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  return { id: data.user.id, email, password, username };
}

/** A client signed in as the given user (authenticated role, subject to RLS). */
export async function signedIn(email: string, password: string): Promise<Db> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function makeAdmin(userId: string) {
  const { error } = await service.from("user_roles").insert({ user_id: userId, role: "admin" });
  if (error) throw error;
}

let categoryId: string | null = null;
async function category() {
  if (categoryId) return categoryId;
  const { data } = await service.from("categories").select("id").eq("slug", "everyday-products").single();
  categoryId = data!.id;
  return categoryId;
}

/** Inserts a complete, verified question directly (fixture shortcut around the admin UI). */
export async function createVerifiedQuestion(
  adminId: string,
  difficulty: "easy" | "medium" | "hard",
  answer: string,
  status: "approved" | "published" = "approved",
) {
  const { data: q, error } = await service
    .from("questions")
    .insert({
      prompt: `TEST ${difficulty} question ${randomUUID()}`,
      context: "Integration-test fixture.",
      difficulty,
      category_id: await category(),
      status,
      created_by: adminId,
      approved_by: adminId,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  await service.from("question_answers").insert({
    question_id: q.id,
    answer_amount: answer as unknown as number,
    answer_definition: "Test fixture value",
    reference_period: "Test period",
    explanation: "Fixture explanation.",
    verification_status: "verified",
    verified_by: adminId,
    verified_at: new Date().toISOString(),
  });
  await service.from("question_sources").insert({
    question_id: q.id,
    title: "Fixture source",
    publisher: "Pricele tests",
    source_url: "https://example.com/fixture",
    created_by: adminId,
  });
  return q.id;
}

/**
 * Creates a live (published) set for `gameDate` with three verified questions. Any existing
 * non-withdrawn set on that date is withdrawn first so fixtures never collide.
 */
export async function createLiveSet(
  adminId: string,
  gameDate: string,
  answers: [string, string, string] = ["100.00", "25000.00", "4000000000.00"],
) {
  await service
    .from("daily_sets")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString(), withdrawn_reason: "test fixture reset" })
    .eq("game_date", gameDate)
    .neq("status", "withdrawn");
  const ids = [
    await createVerifiedQuestion(adminId, "easy", answers[0], "published"),
    await createVerifiedQuestion(adminId, "medium", answers[1], "published"),
    await createVerifiedQuestion(adminId, "hard", answers[2], "published"),
  ];
  const { data: set, error } = await service
    .from("daily_sets")
    .insert({ game_date: gameDate, status: "published", published_at: new Date().toISOString(), published_by: adminId })
    .select("id")
    .single();
  if (error) throw error;
  const { error: e2 } = await service
    .from("daily_set_questions")
    .insert(ids.map((question_id, i) => ({ daily_set_id: set.id, question_id, position: i + 1 })));
  if (e2) throw e2;
  return { setId: set.id, questionIds: ids };
}

export async function createGuestSession() {
  const { data, error } = await service
    .from("guest_sessions")
    .insert({
      token_hash: randomUUID().replace(/-/g, "").padEnd(64, "0"),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export type RpcOk = { ok: true; [k: string]: unknown };
export async function rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await service.rpc(fn as never, args as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** A far-future date unlikely to collide with other fixtures (one active set per date). */
export function uniqueFutureDate() {
  return addDays(today(), 400 + Math.floor(Math.random() * 20000));
}

/** Direct SQL against the local database, for fixtures that cannot be created through the API
 *  (e.g. official attempts dated in the past to build streak history). */
export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const { Client } = await import("pg");
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await db.connect();
  try {
    return (await db.query<T>(text, params)).rows;
  } finally {
    await db.end();
  }
}

/** Records a completed official game on a past date for `userId` with the given scores. */
export async function completedGame(
  adminId: string,
  userId: string,
  gameDate: string,
  guesses: [string, string, string],
  answers: [string, string, string] = ["100.00", "25000.00", "4000000000.00"],
  completedAtHourEt = 12,
) {
  let setId: string;
  let questionIds: string[];
  const existing = await sql<{ id: string }>(
    "select id from public.daily_sets where game_date = $1 and status = 'published' and notes = 'fixture-shared'",
    [gameDate],
  );
  if (existing.length) {
    setId = existing[0].id;
    questionIds = (await sql<{ question_id: string }>(
      "select question_id from public.daily_set_questions where daily_set_id = $1 order by position", [setId],
    )).map((r) => r.question_id);
  } else {
    ({ setId, questionIds } = await createLiveSet(adminId, gameDate, answers));
    await sql("update public.daily_sets set notes = 'fixture-shared' where id = $1", [setId]);
  }
  const ans = await sql<{ question_id: string; answer_amount: string }>(
    "select question_id, answer_amount::text from public.question_answers where question_id = any($1)", [questionIds],
  );
  for (const [i, q] of questionIds.entries()) {
    const a = ans.find((r) => r.question_id === q)!.answer_amount;
    await sql(
      `insert into public.official_attempts (daily_set_id, question_id, position, user_id, guess_amount,
         answer_snapshot, score, absolute_percentage_error, scoring_version, submitted_at)
       values ($1, $2, $3::smallint, $4, $5::numeric, $6::numeric, public.pricele_score($5::numeric, $6::numeric),
         public.pricele_percentage_error($5::numeric, $6::numeric), 'log-ratio-v1',
         (($7::date + make_interval(hours => $8::int + $3::int)) at time zone 'America/New_York'))`,
      [setId, q, i + 1, userId, guesses[i], a, gameDate, completedAtHourEt],
    );
  }
  await sql("select private.refresh_daily_result($1, $2)", [setId, userId]);
  return { setId, questionIds };
}

/** A random past date (2002+) for isolated history fixtures. */
export function randomPastDate(minDaysAgo = 400) {
  return addDays(today(), -(minDaysAgo + Math.floor(Math.random() * 8000)));
}
