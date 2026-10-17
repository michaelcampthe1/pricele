import "server-only";
import type postgres from "postgres";
import { sql } from "@/lib/db";

/**
 * Admin data access. Every function receives the admin's verified user id; the database
 * re-checks the admin role (pricele.assert_admin) and writes the audit log.
 */

export type QuestionInput = {
  prompt: string;
  context: string | null;
  difficulty: "easy" | "medium" | "hard";
  categoryId: string;
  imageUrl: string | null;
  imageAlt: string | null;
  imageCredit: string | null;
  answerAmount: string | null;
  answerDefinition: string;
  referenceDate: string | null;
  referencePeriod: string | null;
  explanation: string;
};

export type SourceInput = {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  referenceDate: string | null;
  supportingExcerpt: string | null;
  verificationNotes: string | null;
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; detail?: string; problems?: string[] };

async function call<T>(query: Promise<postgres.Row[]>): Promise<T> {
  const [row] = await query;
  return row.r as T;
}


export const admin = {
  overview: (a: string) => call<AdminOverview>(sql()`select pricele.admin_overview(${a}::uuid) as r`),
  categories: (a: string) =>
    call<{ id: string; name: string; slug: string; isActive: boolean }[]>(sql()`select pricele.admin_categories(${a}::uuid) as r`),
  addCategory: (a: string, name: string) => call<Result<{ id: string }>>(sql()`select pricele.admin_add_category(${a}::uuid, ${name}) as r`),
  listQuestions: (a: string, f: { status?: string | null; difficulty?: string | null; search?: string | null; limit?: number; offset?: number }) =>
    call<{ total: number; items: AdminQuestionRow[] }>(sql()`
      select pricele.admin_list_questions(${a}::uuid, ${f.status ?? null}, ${f.difficulty ?? null}, ${f.search ?? null},
                                          ${f.limit ?? 50}::int, ${f.offset ?? 0}::int) as r`),
  getQuestion: (a: string, id: string) => call<AdminQuestion | null>(sql()`select pricele.admin_get_question(${a}::uuid, ${id}::uuid) as r`),
  saveQuestion: (a: string, id: string | null, input: QuestionInput) =>
    call<Result<{ id: string }>>(sql()`select pricele.admin_save_question(${a}::uuid, ${id}::uuid, ${sql().json(input)}::jsonb) as r`),
  addSource: (a: string, questionId: string, input: SourceInput) =>
    call<Result<{ id: string }>>(sql()`select pricele.admin_add_source(${a}::uuid, ${questionId}::uuid, ${sql().json(input)}::jsonb) as r`),
  deleteSource: (a: string, sourceId: string) => call<Result>(sql()`select pricele.admin_delete_source(${a}::uuid, ${sourceId}::uuid) as r`),
  verifyAnswer: (a: string, questionId: string, attestation: boolean) =>
    call<Result>(sql()`select pricele.admin_verify_answer(${a}::uuid, ${questionId}::uuid, ${attestation}) as r`),
  setQuestionStatus: (a: string, questionId: string, action: "approve" | "unapprove" | "archive" | "restore") =>
    call<Result>(sql()`select pricele.admin_set_question_status(${a}::uuid, ${questionId}::uuid, ${action}) as r`),
  similarQuestions: (a: string, questionId: string | null, text: string | null) =>
    call<{ id: string; prompt: string; status: string; similarity: number; reason: string }[]>(
      sql()`select pricele.admin_similar_questions(${a}::uuid, ${questionId}::uuid, ${text}) as r`,
    ),
  sourceReview: (a: string) => call<AdminSourceReview>(sql()`select pricele.admin_source_review(${a}::uuid) as r`),
  resolveReport: (a: string, reportId: string, status: "resolved" | "dismissed") =>
    call<Result>(sql()`select pricele.admin_resolve_report(${a}::uuid, ${reportId}::uuid, ${status}) as r`),
  createDailySet: (a: string, date: string) =>
    call<Result<{ id: string }>>(sql()`select pricele.admin_create_daily_set(${a}::uuid, ${date}::date) as r`),
  assignQuestion: (a: string, setId: string, questionId: string) =>
    call<Result<{ position: number }>>(sql()`select pricele.admin_assign_question(${a}::uuid, ${setId}::uuid, ${questionId}::uuid) as r`),
  unassignQuestion: (a: string, setId: string, position: number) =>
    call<Result>(sql()`select pricele.admin_unassign_question(${a}::uuid, ${setId}::uuid, ${position}::smallint) as r`),
  publishDailySet: (a: string, setId: string, confirm: boolean) =>
    call<Result<{ status: string }> & { validation?: SetValidation }>(
      sql()`select pricele.admin_publish_daily_set(${a}::uuid, ${setId}::uuid, ${confirm}) as r`,
    ),
  unpublishDailySet: (a: string, setId: string, reason: string) =>
    call<Result>(sql()`select pricele.admin_unpublish_daily_set(${a}::uuid, ${setId}::uuid, ${reason}) as r`),
  deleteDailySet: (a: string, setId: string) => call<Result>(sql()`select pricele.admin_delete_daily_set(${a}::uuid, ${setId}::uuid) as r`),
  listDailySets: (a: string, from: string | null, to: string | null) =>
    call<AdminSetRow[]>(sql()`select pricele.admin_list_daily_sets(${a}::uuid, ${from}::date, ${to}::date) as r`),
  getDailySet: (a: string, id: string) => call<AdminSet | null>(sql()`select pricele.admin_get_daily_set(${a}::uuid, ${id}::uuid) as r`),
  correctAnswer: (a: string, questionId: string, newAnswer: string, reason: string, sourceUrl: string, confirm: boolean) =>
    call<Result<{ correctionId: string; affectedOfficial: number; affectedPractice: number }>>(sql()`
      select pricele.admin_correct_answer(${a}::uuid, ${questionId}::uuid, ${newAnswer}::numeric, ${reason}, ${sourceUrl}, ${confirm}) as r`),
  searchUsers: (a: string, query: string, limit = 25) =>
    call<AdminUserRow[]>(sql()`select pricele.admin_search_users(${a}::uuid, ${query}, ${limit}::int) as r`),
  setSuspension: (a: string, userId: string, suspend: boolean, reason: string | null) =>
    call<Result>(sql()`select pricele.admin_set_suspension(${a}::uuid, ${userId}::uuid, ${suspend}, ${reason}) as r`),
  auditLog: (a: string, limit = 50, before: string | null = null) =>
    call<AdminAuditRow[]>(sql()`select pricele.admin_audit_log(${a}::uuid, ${limit}::int, ${before}::timestamptz) as r`),
};

export async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const [row] = await sql()`select pricele.is_admin(${userId}::uuid) as r`;
  return row.r === true;
}

export async function cronPublicationCheck() {
  const [row] = await sql()`select pricele.cron_publication_check() as r`;
  return row.r as { today: string; promoted: number; todayLive: boolean; tomorrowReady: boolean; missingNext7: string[] };
}

export type SetValidation = { ok: boolean; errors: string[]; warnings: string[] };

export type AdminOverview = {
  today: string;
  todaySet: { id: string; status: string; gameDate: string } | null;
  upcoming: { date: string; set: { id: string; status: string; questionCount: number } | null }[];
  counts: {
    published: number;
    approvedUnused: number;
    drafts: number;
    awaitingVerification: number;
    sourceProblems: number;
    openReports: number;
  };
  usage: { todayPlayers: number; todayCompletions: number; registeredUsers: number; last7DaysCompletions: number };
  recentActivity: { action: string; entityType: string; entityId: string | null; createdAt: string; admin: string | null }[];
};

export type AdminQuestionRow = {
  id: string;
  prompt: string;
  difficulty: "easy" | "medium" | "hard";
  status: "draft" | "approved" | "published" | "archived";
  isSample: boolean;
  category: string;
  verificationStatus: string | null;
  sourceCount: number;
  problemCount: number;
  gameDate: string | null;
  updatedAt: string;
};

export type AdminQuestion = {
  id: string;
  prompt: string;
  context: string | null;
  difficulty: "easy" | "medium" | "hard";
  categoryId: string;
  category: string;
  status: "draft" | "approved" | "published" | "archived";
  isSample: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  imageCredit: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  answer: {
    amount: string;
    definition: string;
    referenceDate: string | null;
    referencePeriod: string | null;
    explanation: string;
    verificationStatus: string;
    verifiedAt: string | null;
    verifiedBy: string | null;
  } | null;
  sources: {
    id: string;
    title: string;
    publisher: string;
    url: string;
    publishedAt: string | null;
    referenceDate: string | null;
    supportingExcerpt: string | null;
    verificationNotes: string | null;
    verifiedAt: string | null;
  }[];
  problems: string[];
  dailySet: { id: string; gameDate: string; status: string } | null;
  corrections: { id: string; oldAnswer: string; newAnswer: string; reason: string; sourceUrl: string; createdAt: string; affectedOfficial: number }[];
  attemptCount: number;
};

export type AdminSourceReview = {
  problemQuestions: { id: string; prompt: string; status: string; problems: string[] }[];
  sources: {
    id: string;
    questionId: string;
    prompt: string;
    questionStatus: string;
    title: string;
    publisher: string;
    url: string;
    publishedAt: string | null;
    hasExcerpt: boolean;
    verifiedAt: string | null;
  }[];
  reports: { id: string; questionId: string; prompt: string; message: string; status: string; createdAt: string }[];
};

export type AdminSetRow = {
  id: string;
  gameDate: string;
  status: "draft" | "scheduled" | "published" | "withdrawn";
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  questionCount: number;
  players: number;
  completions: number;
};

export type AdminSet = {
  id: string;
  gameDate: string;
  status: "draft" | "scheduled" | "published" | "withdrawn";
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  questions: {
    position: 1 | 2 | 3;
    id: string;
    prompt: string;
    context: string | null;
    difficulty: "easy" | "medium" | "hard";
    category: string;
    status: string;
    isSample: boolean;
    answer: string | null;
    answerDefinition: string | null;
    verificationStatus: string | null;
  }[];
  validation: SetValidation;
  candidates: { id: string; prompt: string; difficulty: "easy" | "medium" | "hard"; category: string; isSample: boolean }[];
  stats: { players: number; completions: number; averageScore: number | null };
};

export type AdminUserRow = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  isPublic: boolean;
  isAdmin: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  gamesCompleted: number;
  lastPlayedAt: string | null;
};

export type AdminAuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  admin: string | null;
};
