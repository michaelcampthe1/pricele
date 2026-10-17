import postgres from "postgres";

export const OWNER_URL = process.env.E2E_OWNER_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/pricele_e2e";
let client: postgres.Sql | null = null;
export function db() {
  client ??= postgres(OWNER_URL, { max: 2, onnotice: () => {} });
  return client;
}

/** Today's set (answers included) — used only to assert answers are NOT leaked before submission. */
export async function todaysAnswers(): Promise<string[]> {
  const rows = await db()`
    select qa.answer_amount::text as a from public.daily_sets ds
      join public.daily_set_questions d on d.daily_set_id = ds.id
      join public.question_answers qa on qa.question_id = d.question_id
     where ds.game_date = pricele.current_game_date() order by d.position`;
  return rows.map((r) => r.a);
}
