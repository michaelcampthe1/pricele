import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { formatGameDate, formatTimestamp } from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import { QuestionCard } from "@/components/game/question-card";
import { QuestionForm } from "@/components/admin/question-form";
import { CorrectionForm, SourceForm, StatusForm, VerifyForm } from "@/components/admin/question-panels";
import { StatusBadge } from "@/components/admin/status-badge";
import { Alert } from "@/components/ui/misc";
import { deleteSourceAction } from "@/app/admin/actions";

export const metadata = { title: "Question" };

function Panel({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
      <h2 id={id} className="mb-4 font-display text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AdminQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const [q, categories, similar] = await Promise.all([
    admin.getQuestion(me.id, id),
    admin.categories(me.id),
    admin.similarQuestions(me.id, id, null),
  ]);
  if (!q) notFound();

  const editable = (q.status === "draft" || q.status === "approved") && !q.dailySet;
  const verified = q.answer?.verificationStatus === "verified";

  return (
    <div className="space-y-6">
      <Link href="/admin/questions" className="text-sm text-muted hover:text-ink">
        ← Questions
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Question</h1>
        <StatusBadge status={q.status} />
        <StatusBadge status={q.answer?.verificationStatus ?? "missing"} />
        {q.isSample && <span className="text-sm text-amber">Sample (fictional) data</span>}
      </div>
      {sp.created && <Alert tone="success" role="status">Draft created. Add a source, verify the answer, then approve it.</Alert>}

      {/* Workflow guidance */}
      <ol className="grid gap-2 text-sm sm:grid-cols-4">
        {[
          ["Draft saved", true],
          ["Source attached", q.sources.length > 0],
          ["Answer verified", verified],
          ["Approved", q.status === "approved" || q.status === "published"],
        ].map(([label, done], i) => (
          <li key={String(label)} className={`rounded-[10px] border px-3 py-2 ${done ? "border-green/30 bg-green-wash text-green-strong" : "border-line text-muted"}`}>
            {i + 1}. {label} {done ? "✓" : ""}
          </li>
        ))}
      </ol>

      {q.problems.length > 0 && q.status !== "published" && (
        <Alert tone="warning" title="Not ready to verify">
          <ul className="list-disc pl-4">
            {q.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      {similar.length > 0 && (
        <Alert tone="warning" title="Possible duplicates">
          <ul className="list-disc pl-4">
            {similar.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/questions/${s.id}`}>{s.prompt}</Link> ({s.reason.toLowerCase()}, {s.status})
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Panel title="Player preview" id="preview">
            <QuestionCard
              question={{
                id: q.id,
                position: q.difficulty === "easy" ? 1 : q.difficulty === "medium" ? 2 : 3,
                difficulty: q.difficulty,
                prompt: q.prompt,
                context: q.context,
                imageUrl: q.imageUrl,
                imageAlt: q.imageAlt,
                imageCredit: q.imageCredit,
                category: q.category,
                isSample: q.isSample,
              }}
            />
            {q.answer && (
              <p className="mt-4 text-sm text-ink-soft">
                Answer revealed after submission: <strong className="tnum">{formatUsd(q.answer.amount)}</strong>, {q.answer.definition}
                {q.answer.referenceDate ? `, ${formatGameDate(q.answer.referenceDate, "short")}` : q.answer.referencePeriod ? `, ${q.answer.referencePeriod}` : ""}.
              </p>
            )}
          </Panel>

          {editable ? (
            <Panel title="Edit" id="edit">
              {q.status === "approved" && (
                <Alert tone="info" className="mb-4">Saving changes returns this question to draft so it gets verified again.</Alert>
              )}
              <QuestionForm question={q} categories={categories} />
            </Panel>
          ) : q.status === "published" ? (
            <Panel title="Correct the published answer" id="correct">
              <CorrectionForm questionId={q.id} attemptCount={q.attemptCount} />
            </Panel>
          ) : (
            <Alert tone="info">
              {q.dailySet ? "Assigned to a daily set; remove it from the set to edit." : "Archived questions can be restored as drafts."}
            </Alert>
          )}

          <Panel title={`Sources (${q.sources.length})`} id="sources">
            {q.sources.length === 0 ? (
              <p className="mb-4 text-sm text-muted">No sources yet. Every published question needs at least one reliable source.</p>
            ) : (
              <ul className="mb-6 space-y-3">
                {q.sources.map((s) => (
                  <li key={s.id} className="rounded-[10px] border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 font-medium text-green-strong underline">
                        <ExternalLink aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.title}
                      </a>
                      {s.verifiedAt ? <StatusBadge status="verified" /> : <StatusBadge status="unverified" />}
                    </div>
                    <p className="mt-0.5 text-muted">
                      {s.publisher}
                      {s.publishedAt && `, published ${formatGameDate(s.publishedAt, "short")}`}
                    </p>
                    {s.supportingExcerpt && <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink-soft">{s.supportingExcerpt}</blockquote>}
                    {s.verificationNotes && <p className="mt-2 text-ink-soft">Notes: {s.verificationNotes}</p>}
                    {q.status !== "published" && (
                      <form action={deleteSourceAction} className="mt-2">
                        <input type="hidden" name="sourceId" value={s.id} />
                        <input type="hidden" name="questionId" value={q.id} />
                        <button type="submit" className="text-xs font-medium text-red underline">Remove source</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {q.status === "published" ? (
              <p className="text-sm text-muted">Sources of published questions are locked. A correction records its own supporting source.</p>
            ) : (
              <SourceForm questionId={q.id} />
            )}
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Workflow" id="workflow">
            <div className="space-y-4 text-sm">
              {q.status === "draft" && !verified && <VerifyForm questionId={q.id} />}
              {q.status === "draft" && verified && <StatusForm questionId={q.id} action="approve" label="Approve question" variant="primary" />}
              {q.status === "approved" && !q.dailySet && (
                <>
                  <p className="text-muted">Approved. Assign it from a daily set page.</p>
                  <StatusForm questionId={q.id} action="unapprove" label="Return to draft" />
                </>
              )}
              {(q.status === "draft" || q.status === "approved") && !q.dailySet && <StatusForm questionId={q.id} action="archive" label="Archive" variant="danger" />}
              {q.status === "archived" && <StatusForm questionId={q.id} action="restore" label="Restore as draft" />}
              {q.dailySet && (
                <p>
                  In the set for{" "}
                  <Link href={`/admin/daily-sets/${q.dailySet.id}`} className="font-medium text-green-strong underline">
                    {formatGameDate(q.dailySet.gameDate, "weekday")}
                  </Link>{" "}
                  ({q.dailySet.status}).
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Record" id="record">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted">Created</dt><dd>{formatTimestamp(q.createdAt)}</dd></div>
              <div><dt className="text-muted">Updated</dt><dd>{formatTimestamp(q.updatedAt)}</dd></div>
              {q.answer?.verifiedAt && <div><dt className="text-muted">Verified</dt><dd>{formatTimestamp(q.answer.verifiedAt)} by {q.answer.verifiedBy ?? "unknown"}</dd></div>}
              {q.approvedAt && <div><dt className="text-muted">Approved</dt><dd>{formatTimestamp(q.approvedAt)} by {q.approvedBy ?? "unknown"}</dd></div>}
              <div><dt className="text-muted">Official attempts</dt><dd className="tnum">{q.attemptCount}</dd></div>
            </dl>
          </Panel>

          {q.corrections.length > 0 && (
            <Panel title="Corrections" id="corrections">
              <ul className="space-y-3 text-sm">
                {q.corrections.map((c) => (
                  <li key={c.id}>
                    <p className="tnum font-medium">{formatUsd(c.oldAnswer)} → {formatUsd(c.newAnswer)}</p>
                    <p className="text-muted">{formatTimestamp(c.createdAt)}, {c.affectedOfficial} attempts re-scored</p>
                    <p className="text-ink-soft">{c.reason}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
