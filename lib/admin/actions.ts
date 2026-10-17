"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, ForbiddenError, type AuthUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";
import { log } from "@/lib/errors/log";
import { fieldErrors, gameDateSchema, httpsUrlSchema, sourceUrlSchema, uuidSchema } from "@/lib/validation";
import { getGameDate } from "@/lib/dates";
import { AiNotConfiguredError, AiRefusedError, suggestQuestions, type AiSuggestion } from "@/lib/ai/suggest";
import type { FormState } from "@/lib/auth/actions";
import { describeIssue } from "./issues";

const ADMIN_ERRORS: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  question_locked: "This question belongs to a scheduled or published set. Use the correction workflow instead.",
  question_incomplete: "The question isn't complete yet.",
  question_unverified: "Verify the answer and sources before approving.",
  question_assigned: "Remove the question from its daily set first.",
  question_not_found: "Question not found.",
  question_not_approved: "Only approved questions can be assigned.",
  question_already_assigned: "That question is already used in another daily set.",
  question_not_published: "Only published questions can be corrected or withdrawn this way.",
  question_withdrawn: "This question was withdrawn.",
  difficulty_mismatch: "Position 1 must be Easy, 2 Medium and 3 Hard.",
  set_not_found: "Daily set not found.",
  set_locked: "This set is no longer a draft.",
  set_not_draft: "Only draft sets can be published.",
  set_invalid: "The set failed validation.",
  set_already_live: "This set is already live and can't be unscheduled.",
  confirmation_mismatch: "Type the set's exact game date to confirm.",
  invalid_answer: "Answers must be positive USD amounts with at most two decimals, up to $1 quadrillion.",
  answer_unchanged: "The new answer is the same as the current one.",
  reason_required: "Give a reason (at least 5 characters).",
  source_required: "A correction needs a supporting source URL.",
  cannot_moderate_self: "You can't suspend your own account.",
  user_not_found: "User not found.",
  invalid_status: "Invalid status.",
};

type RpcRes = { ok: boolean; error?: string; issues?: string[]; [k: string]: unknown };

/** Every admin action: authenticate, authorize (DB role), rate limit. */
async function guard(): Promise<AuthUser | FormState> {
  try {
    const admin = await assertAdmin();
    if (!(await rateLimit("admin", admin.id))) return { message: "Too many admin actions. Wait a moment." };
    return admin;
  } catch (err) {
    if (err instanceof ForbiddenError) return { message: ADMIN_ERRORS.forbidden };
    throw err;
  }
}
function isAdmin(x: AuthUser | FormState): x is AuthUser {
  return typeof (x as AuthUser).id === "string";
}

function fromRpc(res: RpcRes): FormState {
  if (res.ok) return { ok: true };
  const base = ADMIN_ERRORS[res.error ?? ""] ?? "The operation failed.";
  const issues = res.issues?.map(describeIssue);
  return { message: issues?.length ? `${base} ${issues.join(" ")}` : base };
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<RpcRes> {
  const { data, error } = await createServiceClient().rpc(fn as never, args as never);
  if (error) {
    if (error.message.includes("forbidden")) return { ok: false, error: "forbidden" };
    await log("error", "admin.rpc_failed", { fn, error: error.message });
    return { ok: false, error: "unavailable" };
  }
  return data as unknown as RpcRes;
}

// --- Questions -------------------------------------------------------------------------

const amountRe = /^\d{1,16}(\.\d{1,2})?$/;
const questionSchema = z.object({
  prompt: z.string().trim().min(10, "At least 10 characters.").max(300),
  context: z.string().trim().max(600),
  difficulty: z.enum(["easy", "medium", "hard"]),
  category_id: z.union([z.literal(""), uuidSchema]),
  slug: z.union([z.literal(""), z.string().regex(/^[a-z0-9-]{3,80}$/, "Lowercase letters, numbers and dashes.")]),
  image_url: z.union([z.literal(""), httpsUrlSchema]),
  image_alt: z.string().trim().max(200),
  image_credit: z.string().trim().max(200),
  answer_amount: z.union([z.literal(""), z.string().trim().transform((v) => v.replace(/[$,\s]/g, "")).pipe(z.string().regex(amountRe, "A positive amount like 1299 or 1299.99."))]),
  answer_definition: z.string().trim().max(300),
  reference_date: z.union([z.literal(""), gameDateSchema]),
  reference_period: z.string().trim().max(120),
  explanation: z.string().trim().max(1200),
  ai_assisted: z.boolean(),
});

export async function saveQuestionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const id = String(formData.get("id") ?? "") || null;
  const raw = Object.fromEntries(
    ["prompt", "context", "difficulty", "category_id", "slug", "image_url", "image_alt", "image_credit", "answer_amount", "answer_definition", "reference_date", "reference_period", "explanation"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = questionSchema.safeParse({ ...raw, ai_assisted: formData.get("ai_assisted") === "true" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: raw, message: "Fix the highlighted fields." };
  if (parsed.data.image_url && !parsed.data.image_alt) return { fieldErrors: { image_alt: "Describe the image for screen readers." }, values: raw };

  const res = await rpc("admin_save_question", { p_admin_id: admin.id, p_question_id: id, p_payload: parsed.data });
  if (!res.ok) return { ...fromRpc(res), values: raw };
  revalidatePath("/admin", "layout");
  if (!id) redirect(`/admin/questions/${res.question_id}?created=1`);
  return { ok: true, message: res.verification_reset ? "Saved. Answer details changed, so verification was reset." : "Saved." };
}

export async function addSourceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const raw = Object.fromEntries(["question_id", "title", "publisher", "source_url", "published_at", "reference_date", "supporting_excerpt", "verification_notes"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = z
    .object({
      question_id: uuidSchema,
      title: z.string().trim().min(2).max(300),
      publisher: z.string().trim().min(2).max(160),
      source_url: sourceUrlSchema,
      published_at: z.union([z.literal(""), gameDateSchema]),
      reference_date: z.union([z.literal(""), gameDateSchema]),
      supporting_excerpt: z.string().trim().max(2000),
      verification_notes: z.string().trim().max(2000),
    })
    .safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: raw };
  const svc = createServiceClient();
  const { data: locked } = await svc.from("questions").select("status").eq("id", parsed.data.question_id).single();
  if (!locked || ["published", "withdrawn"].includes(locked.status)) return { message: ADMIN_ERRORS.question_locked, values: raw };
  const d = parsed.data;
  const { error } = await svc.from("question_sources").insert({
    question_id: d.question_id, title: d.title, publisher: d.publisher, source_url: d.source_url,
    published_at: d.published_at || null, reference_date: d.reference_date || null,
    supporting_excerpt: d.supporting_excerpt || null, verification_notes: d.verification_notes || null, created_by: admin.id,
  });
  if (error) return { message: "Couldn't add the source.", values: raw };
  // Adding evidence changes what was attested: require re-verification.
  await svc.from("question_answers").update({ verification_status: "unverified", verified_by: null, verified_at: null }).eq("question_id", d.question_id);
  await svc.from("questions").update({ status: "draft", approved_by: null, approved_at: null }).eq("id", d.question_id).eq("status", "approved");
  await svc.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "question.add_source", entity_type: "question", entity_id: d.question_id, details: { host: new URL(d.source_url).host } });
  revalidatePath(`/admin/questions/${d.question_id}`);
  return { ok: true, message: "Source added. Re-verify the question." };
}

export async function removeSourceAction(formData: FormData) {
  const admin = await guard();
  if (!isAdmin(admin)) return;
  const sourceId = uuidSchema.safeParse(formData.get("source_id"));
  const questionId = uuidSchema.safeParse(formData.get("question_id"));
  if (!sourceId.success || !questionId.success) return;
  const svc = createServiceClient();
  const { data: q } = await svc.from("questions").select("status").eq("id", questionId.data).single();
  if (!q || ["published", "withdrawn"].includes(q.status)) return;
  await svc.from("question_sources").delete().eq("id", sourceId.data).eq("question_id", questionId.data);
  await svc.from("question_answers").update({ verification_status: "unverified", verified_by: null, verified_at: null }).eq("question_id", questionId.data);
  await svc.from("questions").update({ status: "draft", approved_by: null, approved_at: null }).eq("id", questionId.data).eq("status", "approved");
  await svc.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "question.remove_source", entity_type: "question", entity_id: questionId.data, details: {} });
  revalidatePath(`/admin/questions/${questionId.data}`);
}

export async function verifyQuestionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  if (formData.get("attest") !== "on") return { fieldErrors: { attest: "Confirm that you checked the sources." } };
  const id = uuidSchema.parse(formData.get("question_id"));
  const res = await rpc("admin_verify_question", { p_admin_id: admin.id, p_question_id: id, p_notes: String(formData.get("notes") ?? "") });
  revalidatePath(`/admin/questions/${id}`);
  return res.ok ? { ok: true, message: "Verified." } : fromRpc(res);
}

export async function setQuestionStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const id = uuidSchema.parse(formData.get("question_id"));
  const status = z.enum(["approved", "draft", "archived"]).parse(formData.get("status"));
  const res = await rpc("admin_set_question_status", { p_admin_id: admin.id, p_question_id: id, p_status: status });
  revalidatePath("/admin", "layout");
  return res.ok ? { ok: true, message: `Status set to ${status}.` } : fromRpc(res);
}

export async function correctAnswerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const raw = Object.fromEntries(["question_id", "new_answer", "reason", "source_url", "public_note", "confirm"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = z
    .object({
      question_id: uuidSchema,
      new_answer: z.string().trim().transform((v) => v.replace(/[$,\s]/g, "")).pipe(z.string().regex(amountRe, "A positive amount like 1299.99.")),
      reason: z.string().trim().min(5, "Explain the correction.").max(2000),
      source_url: sourceUrlSchema,
      public_note: z.string().trim().min(5, "Players see this note with the answer.").max(500),
      confirm: z.literal("CORRECT", { message: "Type CORRECT to confirm." }),
    })
    .safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: raw };
  const d = parsed.data;
  const res = await rpc("admin_correct_answer", {
    p_admin_id: admin.id, p_question_id: d.question_id, p_new_answer: d.new_answer, p_reason: d.reason, p_source_url: d.source_url, p_public_note: d.public_note,
  });
  revalidatePath("/", "layout");
  if (!res.ok) return { ...fromRpc(res), values: raw };
  await log("info", "admin.answer_corrected", { questionId: d.question_id, affected: res.affected_attempts });
  return { ok: true, message: `Correction applied. ${res.affected_attempts} official attempts were rescored; results, leaderboards and streaks are recomputed.` };
}

export async function withdrawQuestionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const raw = Object.fromEntries(["question_id", "reason", "public_note", "confirm"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = z
    .object({
      question_id: uuidSchema,
      reason: z.string().trim().min(5).max(2000),
      public_note: z.string().trim().min(5).max(500),
      confirm: z.literal("WITHDRAW", { message: "Type WITHDRAW to confirm." }),
    })
    .safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: raw };
  const res = await rpc("admin_withdraw_question", { p_admin_id: admin.id, p_question_id: parsed.data.question_id, p_reason: parsed.data.reason, p_public_note: parsed.data.public_note });
  revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: `Withdrawn. ${res.affected_attempts} attempts voided for every player.` } : { ...fromRpc(res), values: raw };
}

// --- Daily sets --------------------------------------------------------------------------

export async function createDailySetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const raw = { game_date: String(formData.get("game_date") ?? ""), notes: String(formData.get("notes") ?? "") };
  const parsed = z.object({ game_date: gameDateSchema, notes: z.string().trim().max(1000) }).safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: raw };
  if (parsed.data.game_date < getGameDate()) return { fieldErrors: { game_date: "Choose today or a future date (Eastern Time)." }, values: raw };
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("daily_sets")
    .insert({ game_date: parsed.data.game_date, notes: parsed.data.notes || null, created_by: admin.id })
    .select("id")
    .single();
  if (error) return { fieldErrors: { game_date: error.code === "23505" ? "A set already exists for that date." : "Couldn't create the set." }, values: raw };
  await svc.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "daily_set.create", entity_type: "daily_set", entity_id: data.id, details: { game_date: parsed.data.game_date } });
  redirect(`/admin/daily-sets/${data.id}`);
}

export async function assignQuestionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const setId = uuidSchema.parse(formData.get("set_id"));
  const position = z.coerce.number().int().min(1).max(3).parse(formData.get("position"));
  const q = String(formData.get("question_id") ?? "");
  const res = await rpc("admin_assign_set_question", { p_admin_id: admin.id, p_daily_set_id: setId, p_position: position, p_question_id: q ? uuidSchema.parse(q) : null });
  revalidatePath(`/admin/daily-sets/${setId}`);
  return res.ok ? { ok: true, message: q ? "Assigned." : "Removed." } : fromRpc(res);
}

export async function publishSetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const setId = uuidSchema.parse(formData.get("set_id"));
  const confirm = String(formData.get("confirm_date") ?? "").trim();
  if (!gameDateSchema.safeParse(confirm).success) return { fieldErrors: { confirm_date: "Type the game date as YYYY-MM-DD." } };
  const res = await rpc("admin_publish_daily_set", { p_admin_id: admin.id, p_daily_set_id: setId, p_confirm_date: confirm });
  revalidatePath("/", "layout");
  if (!res.ok) return fromRpc(res);
  await log("info", "admin.set_published", { setId, status: res.status });
  return { ok: true, message: res.status === "published" ? "Published — it's live now." : "Scheduled. It goes live at midnight Eastern Time on its date." };
}

export async function unscheduleSetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const setId = uuidSchema.parse(formData.get("set_id"));
  const res = await rpc("admin_unschedule_daily_set", { p_admin_id: admin.id, p_daily_set_id: setId });
  revalidatePath("/admin", "layout");
  return res.ok ? { ok: true, message: "Returned to draft." } : fromRpc(res);
}

// --- Users & feedback ------------------------------------------------------------------------

export async function setSuspensionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  const userId = uuidSchema.parse(formData.get("user_id"));
  const suspend = formData.get("suspend") === "true";
  const res = await rpc("admin_set_suspension", { p_admin_id: admin.id, p_user_id: userId, p_suspend: suspend, p_reason: String(formData.get("reason") ?? "") });
  revalidatePath("/admin/users");
  return res.ok ? { ok: true, message: suspend ? "Suspended." : "Suspension lifted." } : fromRpc(res);
}

export async function markFeedbackReviewedAction(formData: FormData) {
  const admin = await guard();
  if (!isAdmin(admin)) return;
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await createServiceClient().from("feedback").update({ status: "reviewed" }).eq("id", id.data);
  revalidatePath("/admin");
}

// --- AI drafting -------------------------------------------------------------------------------

export type SuggestState = FormState & { suggestions?: AiSuggestion[] };

export async function suggestQuestionsAction(_prev: SuggestState, formData: FormData): Promise<SuggestState> {
  const admin = await guard();
  if (!isAdmin(admin)) return admin;
  if (!(await rateLimit("ai", admin.id))) return { message: "AI suggestion limit reached. Try again later." };
  const parsed = z
    .object({ topic: z.string().trim().max(200), difficulty: z.enum(["any", "easy", "medium", "hard"]), count: z.coerce.number().int().min(1).max(5) })
    .safeParse({ topic: formData.get("topic") ?? "", difficulty: formData.get("difficulty") ?? "any", count: formData.get("count") ?? 3 });
  if (!parsed.success) return { message: "Invalid request." };
  const { data: recent } = await createServiceClient().from("questions").select("prompt").order("created_at", { ascending: false }).limit(30);
  try {
    const suggestions = await suggestQuestions({ ...parsed.data, avoid: (recent ?? []).map((r) => r.prompt) });
    await log("info", "admin.ai_suggest", { count: suggestions.length });
    return { ok: true, suggestions };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return { message: "AI drafting isn't configured. Set AI_PROVIDER_API_KEY to enable it." };
    if (err instanceof AiRefusedError) return { message: "The AI declined this request. Try a different topic." };
    await log("error", "admin.ai_suggest_failed", { error: err });
    return { message: "The AI service didn't respond. The manual workflow is unaffected." };
  }
}
