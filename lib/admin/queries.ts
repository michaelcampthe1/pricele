import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { addDays, getGameDate } from "@/lib/dates";

/**
 * Admin reads use the service client and MUST only be called after assertAdmin()/the admin
 * layout check. They return answer keys and other confidential data.
 */
const svc = () => createServiceClient();

export async function getOverview() {
  const today = getGameDate();
  const [sets, published, drafts, unverified, noSources, audit, players, feedback] = await Promise.all([
    svc().from("daily_sets").select("id, game_date, status, is_sample").gte("game_date", today).lte("game_date", addDays(today, 13)).neq("status", "withdrawn").order("game_date"),
    svc().from("questions").select("id", { count: "exact", head: true }).eq("status", "published"),
    svc().from("questions").select("id", { count: "exact", head: true }).eq("status", "draft"),
    svc().from("question_answers").select("question_id, questions!inner(status)", { count: "exact", head: true }).neq("verification_status", "verified").in("questions.status", ["draft", "approved"]),
    svc().from("questions").select("id, prompt, status, question_sources(id)").in("status", ["draft", "approved"]).limit(200),
    svc().from("admin_audit_log").select("id, action, entity_type, entity_id, details, created_at, admin_user_id").order("created_at", { ascending: false }).limit(15),
    svc().from("daily_results").select("user_id", { count: "exact", head: true }).eq("game_date", today),
    svc().from("feedback").select("id, message, contact, status, created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const upcoming = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i);
    const set = (sets.data ?? []).find((s) => s.game_date === date);
    return { date, set: set ?? null };
  });
  return {
    today,
    upcoming,
    publishedCount: published.count ?? 0,
    draftCount: drafts.count ?? 0,
    unverifiedCount: unverified.count ?? 0,
    missingSources: (noSources.data ?? []).filter((q) => (q.question_sources as unknown[]).length === 0).map((q) => ({ id: q.id, prompt: q.prompt, status: q.status })),
    audit: audit.data ?? [],
    completedToday: players.count ?? 0,
    feedback: feedback.data ?? [],
  };
}

export type QuestionFilter = { status?: string; difficulty?: string; q?: string; page?: number };
export const ADMIN_PAGE = 25;

export async function listQuestions(f: QuestionFilter) {
  let query = svc()
    .from("questions")
    .select("id, prompt, difficulty, status, is_sample, ai_assisted, created_at, categories(name), question_answers(answer_amount::text, verification_status), question_sources(id), daily_set_questions(daily_sets(game_date, status))", { count: "exact" })
    .order("created_at", { ascending: false });
  if (f.status) query = query.eq("status", f.status as never);
  if (f.difficulty) query = query.eq("difficulty", f.difficulty as never);
  if (f.q) query = query.ilike("prompt", `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const page = f.page ?? 1;
  const { data, count, error } = await query.range((page - 1) * ADMIN_PAGE, page * ADMIN_PAGE - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], count: count ?? 0 };
}

export async function getQuestion(id: string) {
  const [q, answer, sources, membership, corrections, audit] = await Promise.all([
    svc().from("questions").select("*, categories(name)").eq("id", id).maybeSingle(),
    svc().from("question_answers").select("answer_amount::text, currency, answer_definition, reference_date, reference_period, explanation, verification_status, verification_notes, verified_by, verified_at").eq("question_id", id).maybeSingle(),
    svc().from("question_sources").select("*").eq("question_id", id).order("created_at"),
    svc().from("daily_set_questions").select("position, daily_sets(id, game_date, status)").eq("question_id", id).maybeSingle(),
    svc().from("question_corrections").select("kind, old_answer::text, new_answer::text, reason, source_url, affected_attempts, created_at").eq("question_id", id).order("created_at", { ascending: false }),
    svc().from("admin_audit_log").select("action, details, created_at").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!q.data) return null;
  const similar = await svc().rpc("admin_similar_questions", { p_prompt: q.data.prompt, p_exclude: id, p_limit: 5 });
  const { count: attempts } = await svc().from("official_attempts").select("id", { count: "exact", head: true }).eq("question_id", id);
  return {
    question: q.data,
    answer: answer.data as null | {
      answer_amount: string | null; currency: string; answer_definition: string | null; reference_date: string | null;
      reference_period: string | null; explanation: string | null; verification_status: string; verification_notes: string | null;
      verified_by: string | null; verified_at: string | null;
    },
    sources: sources.data ?? [],
    membership: membership.data as null | { position: number; daily_sets: { id: string; game_date: string; status: string } | null },
    corrections: (corrections.data ?? []) as unknown as { kind: string; old_answer: string | null; new_answer: string | null; reason: string; source_url: string | null; affected_attempts: number; created_at: string }[],
    audit: audit.data ?? [],
    similar: similar.data ?? [],
    attemptCount: attempts ?? 0,
  };
}

export async function listCategories() {
  const { data } = await svc().from("categories").select("id, name, is_active").order("name");
  return data ?? [];
}

export async function listDailySets(page = 1) {
  const { data, count } = await svc()
    .from("daily_sets")
    .select("id, game_date, status, is_sample, published_at, daily_set_questions(position)", { count: "exact" })
    .order("game_date", { ascending: false })
    .range((page - 1) * ADMIN_PAGE, page * ADMIN_PAGE - 1);
  return { rows: data ?? [], count: count ?? 0 };
}

export async function getDailySet(id: string) {
  const { data: set } = await svc().from("daily_sets").select("*").eq("id", id).maybeSingle();
  if (!set) return null;
  const [{ data: members }, { data: issues }, { data: candidates }, { count: attempts }] = await Promise.all([
    svc()
      .from("daily_set_questions")
      .select("position, questions(id, prompt, context, difficulty, status, image_url, image_alt, image_credit, correction_note, question_answers(answer_amount::text, answer_definition, verification_status), question_sources(id))")
      .eq("daily_set_id", id)
      .order("position"),
    svc().rpc("validate_daily_set", { p_daily_set_id: id }),
    svc()
      .from("questions")
      .select("id, prompt, difficulty, daily_set_questions(daily_set_id)")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(200),
    svc().from("official_attempts").select("id", { count: "exact", head: true }).eq("daily_set_id", id),
  ]);
  return {
    set,
    members: members ?? [],
    issues: (issues as string[] | null) ?? [],
    candidates: (candidates ?? []).filter((c) => !c.daily_set_questions),
    attemptCount: attempts ?? 0,
  };
}

export async function listSourceIssues() {
  const { data } = await svc()
    .from("questions")
    .select("id, prompt, status, question_answers(verification_status, verified_at), question_sources(id, title, publisher, source_url, verified_at, supporting_excerpt)")
    .in("status", ["draft", "approved", "published"])
    .order("updated_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((q) => {
    const sources = q.question_sources as { id: string; title: string; publisher: string; source_url: string; verified_at: string | null; supporting_excerpt: string | null }[];
    const answer = q.question_answers as unknown as { verification_status: string } | null;
    const problems: string[] = [];
    if (sources.length === 0) problems.push("No sources");
    if (sources.some((s) => !s.supporting_excerpt)) problems.push("Source without supporting excerpt");
    if (answer?.verification_status !== "verified") problems.push("Answer not verified");
    if (sources.some((s) => !s.verified_at)) problems.push("Unchecked source");
    return { id: q.id, prompt: q.prompt, status: q.status, sources, problems };
  });
}

export async function searchUsers(term: string) {
  const t = term.trim().toLowerCase();
  let query = svc().from("profiles").select("id, username, display_name, is_public, suspended_at, suspended_reason, created_at").order("created_at", { ascending: false }).limit(25);
  if (t) query = query.or(`username.ilike.%${t.replace(/[%_,()\\]/g, "")}%,display_name.ilike.%${t.replace(/[%_,()\\]/g, "")}%`);
  const { data } = await query;
  const ids = (data ?? []).map((u) => u.id);
  const [{ data: roles }, { data: results }] = await Promise.all([
    svc().from("user_roles").select("user_id, role").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    svc().from("daily_results").select("user_id").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  return (data ?? []).map((u) => ({
    ...u,
    isAdmin: (roles ?? []).some((r) => r.user_id === u.id),
    games: (results ?? []).filter((r) => r.user_id === u.id).length,
  }));
}
