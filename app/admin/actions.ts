"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminOrNull } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { parseUsdInput } from "@/lib/money";
import { isGameDateString } from "@/lib/dates";
import { fieldErrors } from "@/lib/validation";
import { rateLimit } from "@/lib/game/service";
import { logger } from "@/lib/logger";

export type AdminFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  problems?: string[];
  message?: string;
};

const FORBIDDEN: AdminFormState = { error: "You don't have permission to do that." };

const ERRORS: Record<string, string> = {
  not_found: "That item no longer exists.",
  not_editable: "Published or archived questions can't be edited. Use a correction instead.",
  assigned_to_set: "This question is assigned to a daily set. Remove it from the set first.",
  invalid_amount: "Enter a positive USD amount with at most two decimals.",
  invalid_input: "Some fields are invalid. Check lengths and formats.",
  attestation_required: "Confirm that you checked the source supports the exact amount.",
  not_draft: "Only draft questions can be verified or approved.",
  not_verified: "Verify the answer and sources before approving.",
  incomplete: "This question isn't ready to verify.",
  date_in_past: "Daily sets can only be created for today or a future date.",
  date_too_far: "Pick a date within the next year.",
  date_taken: "A daily set already exists for that date.",
  set_locked: "This set is published. Unpublish it first (only possible before anyone plays).",
  question_not_approved: "Only approved questions can be assigned.",
  question_already_used: "That question is already used in another daily set.",
  question_not_found: "That question doesn't exist.",
  confirmation_required: "Tick the confirmation box to continue.",
  validation_failed: "The set didn't pass validation.",
  already_played: "Players have already played this set, so it can't be withdrawn. Use a correction instead.",
  reason_required: "Give a reason (at least 10 characters for corrections, 5 for withdrawals).",
  not_published: "Only published questions can be corrected.",
  unchanged: "The new answer is the same as the current one.",
  source_required: "Add an http(s) source URL that supports the correction.",
  cannot_moderate_self: "You can't suspend your own account.",
  not_deletable: "Only draft sets can be deleted.",
  duplicate: "That category already exists.",
  immutable: "Sources of published questions can't be removed.",
};

function fail(code: string, extra: Partial<AdminFormState> = {}): AdminFormState {
  return { error: ERRORS[code] ?? "That didn't work.", ...extra };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optional = (fd: FormData, k: string) => str(fd, k) || null;

const questionSchema = z.object({
  prompt: z.string().min(10, "At least 10 characters.").max(300),
  context: z.string().max(600).nullable(),
  difficulty: z.enum(["easy", "medium", "hard"], { message: "Choose a difficulty." }),
  categoryId: z.uuid("Choose a category."),
  imageUrl: z.string().regex(/^https:\/\/\S+$/, "Use an https:// URL.").max(500).nullable(),
  imageAlt: z.string().max(200).nullable(),
  imageCredit: z.string().max(200).nullable(),
  answerDefinition: z.string().min(5, "Say exactly what the amount measures.").max(300),
  referenceDate: z.string().refine((v) => isGameDateString(v), "Use a valid date.").nullable(),
  referencePeriod: z.string().max(120).nullable(),
  explanation: z.string().max(1200),
});

export async function saveQuestionAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const id = optional(fd, "id");
  const parsed = questionSchema.safeParse({
    prompt: str(fd, "prompt"),
    context: optional(fd, "context"),
    difficulty: str(fd, "difficulty"),
    categoryId: str(fd, "categoryId"),
    imageUrl: optional(fd, "imageUrl"),
    imageAlt: optional(fd, "imageAlt"),
    imageCredit: optional(fd, "imageCredit"),
    answerDefinition: str(fd, "answerDefinition"),
    referenceDate: optional(fd, "referenceDate"),
    referencePeriod: optional(fd, "referencePeriod"),
    explanation: str(fd, "explanation"),
  });
  const amount = parseUsdInput(str(fd, "answerAmount"));
  const errs = parsed.success ? {} : fieldErrors(parsed.error);
  if (!amount.ok) errs.answerAmount = amount.error;
  if (parsed.success && parsed.data.imageUrl && !parsed.data.imageAlt) errs.imageAlt = "Describe the image for screen readers.";
  if (!parsed.success || Object.keys(errs).length) return { fieldErrors: errs };

  const r = await admin.saveQuestion(me.id, id, { ...parsed.data, answerAmount: amount.ok ? amount.value : null });
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin", "layout");
  if (!id) redirect(`/admin/questions/${r.id}?created=1`);
  return { ok: true, message: "Saved. Edits return the question to draft, so verify and approve it again." };
}

const sourceSchema = z.object({
  title: z.string().min(2, "Add the source title.").max(300),
  publisher: z.string().min(2, "Add the publisher or organization.").max(160),
  url: z.string().regex(/^https?:\/\/\S+$/, "Use a full http(s) URL.").max(1000),
  publishedAt: z.string().refine(isGameDateString, "Use a valid date.").nullable(),
  referenceDate: z.string().refine(isGameDateString, "Use a valid date.").nullable(),
  supportingExcerpt: z.string().max(1200).nullable(),
  verificationNotes: z.string().max(1200).nullable(),
});

export async function addSourceAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const questionId = z.uuid().safeParse(str(fd, "questionId"));
  if (!questionId.success) return fail("not_found");
  const parsed = sourceSchema.safeParse({
    title: str(fd, "title"),
    publisher: str(fd, "publisher"),
    url: str(fd, "url"),
    publishedAt: optional(fd, "publishedAt"),
    referenceDate: optional(fd, "referenceDate"),
    supportingExcerpt: optional(fd, "supportingExcerpt"),
    verificationNotes: optional(fd, "verificationNotes"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const r = await admin.addSource(me.id, questionId.data, parsed.data);
  if (!r.ok) return fail(r.error);
  revalidatePath(`/admin/questions/${questionId.data}`);
  return { ok: true, message: "Source added." };
}

export async function deleteSourceAction(fd: FormData): Promise<void> {
  const me = await adminOrNull();
  if (!me) return;
  const sourceId = z.uuid().safeParse(str(fd, "sourceId"));
  const questionId = str(fd, "questionId");
  if (!sourceId.success) return;
  await admin.deleteSource(me.id, sourceId.data);
  revalidatePath(`/admin/questions/${questionId}`);
}

export async function verifyAnswerAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const id = str(fd, "questionId");
  const r = await admin.verifyAnswer(me.id, id, fd.get("attest") === "on");
  if (!r.ok) return fail(r.error, { problems: r.problems });
  revalidatePath(`/admin/questions/${id}`);
  return { ok: true, message: "Answer verified." };
}

export async function questionStatusAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const id = str(fd, "questionId");
  const action = z.enum(["approve", "unapprove", "archive", "restore"]).safeParse(str(fd, "action"));
  if (!action.success) return fail("invalid_input");
  const r = await admin.setQuestionStatus(me.id, id, action.data);
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Question ${action.data === "approve" ? "approved" : action.data === "unapprove" ? "returned to draft" : action.data === "archive" ? "archived" : "restored as draft"}.` };
}

export async function correctAnswerAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const id = str(fd, "questionId");
  const amount = parseUsdInput(str(fd, "newAnswer"));
  if (!amount.ok) return { fieldErrors: { newAnswer: amount.error } };
  const r = await admin.correctAnswer(me.id, id, amount.value, str(fd, "reason"), str(fd, "sourceUrl"), fd.get("confirm") === "on");
  if (!r.ok) return fail(r.error);
  logger.info("admin.correction", { questionId: id, affected: r.affectedOfficial });
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Correction applied. ${r.affectedOfficial} official and ${r.affectedPractice} practice attempts were re-scored; results, leaderboards and streaks were recomputed.`,
  };
}

export async function createDailySetAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const date = str(fd, "gameDate");
  if (!isGameDateString(date)) return { fieldErrors: { gameDate: "Pick a valid date." } };
  const r = await admin.createDailySet(me.id, date);
  if (!r.ok) return fail(r.error);
  redirect(`/admin/daily-sets/${r.id}`);
}

export async function assignQuestionAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const setId = str(fd, "setId");
  const questionId = z.uuid().safeParse(str(fd, "questionId"));
  if (!questionId.success) return { fieldErrors: { questionId: "Choose a question." } };
  const r = await admin.assignQuestion(me.id, setId, questionId.data);
  if (!r.ok) return fail(r.error);
  revalidatePath(`/admin/daily-sets/${setId}`);
  return { ok: true };
}

export async function unassignQuestionAction(fd: FormData): Promise<void> {
  const me = await adminOrNull();
  if (!me) return;
  const setId = str(fd, "setId");
  const position = Number(str(fd, "position"));
  if (![1, 2, 3].includes(position)) return;
  await admin.unassignQuestion(me.id, setId, position);
  revalidatePath(`/admin/daily-sets/${setId}`);
}

export async function publishSetAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  if (!(await rateLimit(`admin-publish:${me.id}`, 60, 20))) return { error: "Too many attempts. Wait a minute." };
  const setId = str(fd, "setId");
  const r = await admin.publishDailySet(me.id, setId, fd.get("confirm") === "on");
  if (!r.ok) return fail(r.error, { problems: r.validation?.errors });
  logger.info("admin.publish", { setId, status: r.status });
  revalidatePath("/", "layout");
  return { ok: true, message: r.status === "scheduled" ? "Published. It goes live at midnight ET on its date." : "Published and live now." };
}

export async function unpublishSetAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const setId = str(fd, "setId");
  const r = await admin.unpublishDailySet(me.id, setId, str(fd, "reason"));
  if (!r.ok) return fail(r.error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Set returned to draft." };
}

export async function deleteSetAction(fd: FormData): Promise<void> {
  const me = await adminOrNull();
  if (!me) return;
  const r = await admin.deleteDailySet(me.id, str(fd, "setId"));
  if (r.ok) redirect("/admin/daily-sets");
}

export async function suspensionAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const userId = str(fd, "userId");
  const suspend = str(fd, "suspend") === "true";
  const r = await admin.setSuspension(me.id, userId, suspend, optional(fd, "reason"));
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin/users");
  return { ok: true, message: suspend ? "Account suspended." : "Suspension lifted." };
}

export async function resolveReportAction(fd: FormData): Promise<void> {
  const me = await adminOrNull();
  if (!me) return;
  const status = str(fd, "status") === "resolved" ? "resolved" : "dismissed";
  await admin.resolveReport(me.id, str(fd, "reportId"), status);
  revalidatePath("/admin/sources");
}

export async function addCategoryAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const me = await adminOrNull();
  if (!me) return FORBIDDEN;
  const name = str(fd, "name");
  if (name.length < 2 || name.length > 60) return { fieldErrors: { name: "2–60 characters." } };
  const r = await admin.addCategory(me.id, name);
  if (!r.ok) return fail(r.error);
  revalidatePath("/admin/questions");
  return { ok: true, message: "Category added." };
}

export async function aiSuggestAction(topic: string) {
  const me = await adminOrNull();
  if (!me) return { ok: false as const, error: FORBIDDEN.error! };
  const t = String(topic ?? "").trim();
  if (t.length < 3 || t.length > 500) return { ok: false as const, error: "Describe a topic in 3–500 characters." };
  if (!(await rateLimit(`ai:${me.id}`, 3600, 20))) return { ok: false as const, error: "AI suggestion limit reached. Try again later." };
  const { suggestQuestions } = await import("@/lib/ai/suggest");
  return suggestQuestions(t);
}
