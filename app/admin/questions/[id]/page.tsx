import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getQuestion, listCategories } from "@/lib/admin/queries";
import {
  addSourceAction,
  correctAnswerAction,
  removeSourceAction,
  setQuestionStatusAction,
  verifyQuestionAction,
  withdrawQuestionAction,
} from "@/lib/admin/actions";
import { uuidSchema } from "@/lib/validation";
import { formatUsd } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { StatusPill } from "@/components/admin/status-pill";
import { AdminForm } from "@/components/admin/admin-form";
import { QuestionEditor } from "@/components/admin/question-editor";
import { QuestionView } from "@/components/game/question-view";

export const metadata = { title: "Question" };

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="font-semibold">{title}</h2>
      <Card className="p-5">{children}</Card>
    </section>
  );
}

export default async function AdminQuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const [data, categories] = await Promise.all([getQuestion(id), listCategories()]);
  if (!data) notFound();
  const { question: q, answer: a, sources, membership, corrections, audit, similar, attemptCount } = data;
  const set = membership?.daily_sets ?? null;
  const locked = ["published", "withdrawn"].includes(q.status) || (set !== null && ["scheduled", "published", "withdrawn"].includes(set.status));

  return (
    <div className="space-y-8">
      {sp.created ? <Alert tone="success">Draft created. Add sources, then verify and approve.</Alert> : null}
      <header className="space-y-2">
        <Link href="/admin/questions" className="text-sm text-muted hover:underline">← Questions</Link>
        <h1 className="text-xl font-semibold">{q.prompt}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill status={q.status} />
          <StatusPill status={a?.verification_status ?? "unverified"} />
          {q.ai_assisted ? <span className="text-xs text-muted">AI-assisted draft</span> : null}
          {q.is_sample ? <span className="text-xs text-warning">Sample content</span> : null}
          {set ? <Link href={`/admin/daily-sets/${set.id}`} className="text-accent-strong hover:underline">Set {set.game_date} · position {membership!.position}</Link> : null}
          <span className="text-muted">{attemptCount} official attempts</span>
        </div>
      </header>

      <Section title="Player preview">
        <div className="tag-notch rounded-[var(--radius-lg)] border border-border p-5">
          <QuestionView
            question={{ id: q.id, position: (membership?.position ?? 1) as 1 | 2 | 3, difficulty: q.difficulty, prompt: q.prompt, context: q.context, imageUrl: q.image_url, imageAlt: q.image_alt, imageCredit: q.image_credit, withdrawn: q.status === "withdrawn", correctionNote: q.correction_note }}
          />
        </div>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Answer</dt><dd className="tabular font-semibold">{a?.answer_amount ? formatUsd(a.answer_amount) : "Missing"}</dd></div>
          <div><dt className="text-muted">Definition</dt><dd>{a?.answer_definition ?? "Missing"}</dd></div>
          <div><dt className="text-muted">Reference</dt><dd>{a?.reference_period ?? a?.reference_date ?? "Missing"}</dd></div>
          <div><dt className="text-muted">Verified</dt><dd>{a?.verified_at ? new Date(a.verified_at).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET" : "No"}</dd></div>
        </dl>
        {a?.explanation ? <p className="mt-3 text-sm text-ink-soft">{a.explanation}</p> : null}
      </Section>

      {similar.length ? (
        <Alert tone="warning" title="Possible duplicates">
          <ul className="space-y-1">
            {similar.map((s) => (
              <li key={s.id}><Link className="underline" href={`/admin/questions/${s.id}`}>{s.prompt}</Link> ({Math.round(s.similarity * 100)}% similar, {s.status})</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {!locked ? (
        <Section title="Edit">
          <QuestionEditor
            categories={categories.filter((c) => c.is_active || c.id === q.category_id)}
            initial={{
              id: q.id, prompt: q.prompt, context: q.context ?? "", difficulty: q.difficulty, category_id: q.category_id ?? "", slug: q.slug ?? "",
              image_url: q.image_url ?? "", image_alt: q.image_alt ?? "", image_credit: q.image_credit ?? "", answer_amount: a?.answer_amount ?? "",
              answer_definition: a?.answer_definition ?? "", reference_date: a?.reference_date ?? "", reference_period: a?.reference_period ?? "",
              explanation: a?.explanation ?? "", ai_assisted: q.ai_assisted,
            }}
          />
        </Section>
      ) : (
        <Alert tone="info">This question is locked because it belongs to a scheduled or published set. Published wording never changes; use the correction workflow below for answer errors.</Alert>
      )}

      <Section title={`Sources (${sources.length})`}>
        {sources.length === 0 ? <p className="text-sm text-error">No sources yet. At least one reliable source is required.</p> : (
          <ul className="divide-y divide-border">
            {sources.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 space-y-1">
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-accent-strong hover:underline">
                    {s.title} <ExternalLink aria-hidden className="size-3.5" />
                  </a>
                  <p className="text-xs text-muted">{s.publisher}{s.published_at ? ` · published ${s.published_at.slice(0, 10)}` : ""}{s.reference_date ? ` · reference ${s.reference_date}` : ""} · {s.verified_at ? "checked" : "not yet checked"}</p>
                  {s.supporting_excerpt ? <blockquote className="border-l-2 border-border-strong pl-3 text-xs text-ink-soft">{s.supporting_excerpt}</blockquote> : <p className="text-xs text-warning">No supporting excerpt recorded.</p>}
                  {s.verification_notes ? <p className="text-xs text-muted">Notes: {s.verification_notes}</p> : null}
                </div>
                {!locked ? (
                  <form action={removeSourceAction}>
                    <input type="hidden" name="source_id" value={s.id} />
                    <input type="hidden" name="question_id" value={q.id} />
                    <button className="text-xs text-error hover:underline">Remove</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!locked ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-accent-strong">Add a source</summary>
            <AdminForm action={addSourceAction} submitLabel="Add source" className="mt-3 space-y-3">
              <input type="hidden" name="question_id" value={q.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="src-title" label="Title"><TextInput id="src-title" name="title" /></Field>
                <Field id="src-publisher" label="Publisher / organization"><TextInput id="src-publisher" name="publisher" /></Field>
              </div>
              <Field id="src-url" label="URL"><TextInput id="src-url" name="source_url" type="url" placeholder="https://" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="src-pub" label="Publication date (optional)"><TextInput id="src-pub" name="published_at" type="date" /></Field>
                <Field id="src-ref" label="Reference date (optional)"><TextInput id="src-ref" name="reference_date" type="date" /></Field>
              </div>
              <Field id="src-excerpt" label="Supporting excerpt" hint="Quote the passage that states the exact figure."><TextArea id="src-excerpt" name="supporting_excerpt" rows={3} /></Field>
              <Field id="src-notes" label="Verification notes (optional)"><TextArea id="src-notes" name="verification_notes" rows={2} /></Field>
            </AdminForm>
          </details>
        ) : null}
      </Section>

      {!locked ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Verify">
            <AdminForm action={verifyQuestionAction} submitLabel="Mark verified">
              <input type="hidden" name="question_id" value={q.id} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="attest" className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>I opened the sources and confirmed they support the exact amount, definition and reference period, and that the question is unambiguous.</span>
              </label>
              <Field id="verify-notes" label="Verification notes (optional)"><TextArea id="verify-notes" name="notes" rows={2} /></Field>
            </AdminForm>
          </Section>
          <Section title="Workflow status">
            <div className="flex flex-wrap gap-2">
              <AdminForm action={setQuestionStatusAction} submitLabel="Approve for scheduling">
                <input type="hidden" name="question_id" value={q.id} />
                <input type="hidden" name="status" value="approved" />
              </AdminForm>
              <AdminForm action={setQuestionStatusAction} submitLabel="Back to draft" variant="secondary">
                <input type="hidden" name="question_id" value={q.id} />
                <input type="hidden" name="status" value="draft" />
              </AdminForm>
              <AdminForm action={setQuestionStatusAction} submitLabel="Archive" variant="secondary">
                <input type="hidden" name="question_id" value={q.id} />
                <input type="hidden" name="status" value="archived" />
              </AdminForm>
            </div>
          </Section>
        </div>
      ) : null}

      {q.status === "published" ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Correct the answer" id="correct">
            <p className="mb-3 text-sm text-muted">Every official attempt is rescored against the new answer, identically for all players. Originals are kept for audit; results, leaderboards and streaks are recomputed; players see the note.</p>
            <AdminForm action={correctAnswerAction} submitLabel="Apply correction" variant="danger">
              <input type="hidden" name="question_id" value={q.id} />
              <Field id="c-new" label={`New answer (currently ${a?.answer_amount ? formatUsd(a.answer_amount) : "—"})`}><TextInput id="c-new" name="new_answer" inputMode="decimal" /></Field>
              <Field id="c-reason" label="Internal reason"><TextArea id="c-reason" name="reason" rows={2} /></Field>
              <Field id="c-source" label="Supporting source URL"><TextInput id="c-source" name="source_url" type="url" /></Field>
              <Field id="c-note" label="Public correction note"><TextArea id="c-note" name="public_note" rows={2} /></Field>
              <Field id="c-confirm" label="Type CORRECT to confirm"><TextInput id="c-confirm" name="confirm" autoComplete="off" /></Field>
            </AdminForm>
          </Section>
          <Section title="Withdraw question">
            <p className="mb-3 text-sm text-muted">Use only when the question can&apos;t be fixed fairly. It becomes void for every player: attempts are kept but excluded, and the day completes on the remaining questions.</p>
            <AdminForm action={withdrawQuestionAction} submitLabel="Withdraw for everyone" variant="danger">
              <input type="hidden" name="question_id" value={q.id} />
              <Field id="w-reason" label="Internal reason"><TextArea id="w-reason" name="reason" rows={2} /></Field>
              <Field id="w-note" label="Public note"><TextArea id="w-note" name="public_note" rows={2} /></Field>
              <Field id="w-confirm" label="Type WITHDRAW to confirm"><TextInput id="w-confirm" name="confirm" autoComplete="off" /></Field>
            </AdminForm>
          </Section>
        </div>
      ) : null}

      {corrections.length ? (
        <Section title="Correction history">
          <ul className="divide-y divide-border text-sm">
            {corrections.map((c) => (
              <li key={c.created_at} className="py-2">
                <span className="font-medium">{c.kind === "withdrawal" ? "Withdrawn" : `${formatUsd(c.old_answer!)} → ${formatUsd(c.new_answer!)}`}</span>
                <span className="text-muted"> · {c.affected_attempts} attempts · {new Date(c.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET</span>
                <p className="text-ink-soft">{c.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Audit trail">
        {audit.length === 0 ? <p className="text-sm text-muted">No entries.</p> : (
          <ul className="space-y-1 text-sm">
            {audit.map((e) => (
              <li key={e.created_at + e.action}><span className="font-mono text-xs">{e.action}</span> <span className="text-muted">{new Date(e.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET</span></li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
