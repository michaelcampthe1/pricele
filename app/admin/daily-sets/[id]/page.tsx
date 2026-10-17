import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { getDailySet } from "@/lib/admin/queries";
import { assignQuestionAction, publishSetAction, unscheduleSetAction } from "@/lib/admin/actions";
import { describeIssue } from "@/lib/admin/issues";
import { uuidSchema } from "@/lib/validation";
import { formatGameDate, getGameDate } from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import { DIFFICULTIES, DIFFICULTY_LABEL } from "@/lib/game/types";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field, Select, TextInput } from "@/components/ui/field";
import { AdminForm } from "@/components/admin/admin-form";
import { StatusPill } from "@/components/admin/status-pill";
import { QuestionView } from "@/components/game/question-view";

export const metadata = { title: "Daily set" };

type Member = {
  position: number;
  questions: {
    id: string; prompt: string; context: string | null; difficulty: "easy" | "medium" | "hard"; status: string;
    image_url: string | null; image_alt: string | null; image_credit: string | null; correction_note: string | null;
    question_answers: { answer_amount: string | null; answer_definition: string | null; verification_status: string } | null;
    question_sources: { id: string }[];
  } | null;
};

export default async function DailySetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const data = await getDailySet(id);
  if (!data) notFound();
  const { set, issues, candidates, attemptCount } = data;
  const members = data.members as unknown as Member[];
  const draft = set.status === "draft";
  const today = getGameDate();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/admin/daily-sets" className="text-sm text-muted hover:underline">← Daily sets</Link>
        <h1 className="text-2xl font-semibold">{formatGameDate(set.game_date)}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill status={set.status} />
          {set.is_sample ? <StatusPill status="sample" /> : null}
          {set.status === "scheduled" ? <span className="text-muted">Goes live at midnight ET on {set.game_date}</span> : null}
          {set.published_at ? <span className="text-muted">Published {new Date(set.published_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET</span> : null}
          <span className="text-muted">{attemptCount} official attempts</span>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {DIFFICULTIES.map((difficulty, i) => {
          const position = i + 1;
          const m = members.find((x) => x.position === position);
          const q = m?.questions;
          return (
            <Card key={difficulty} className="flex flex-col p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Position {position} · {DIFFICULTY_LABEL[difficulty]}</p>
              {q ? (
                <div className="mt-2 flex-1 space-y-2 text-sm">
                  <Link href={`/admin/questions/${q.id}`} className="font-medium hover:underline">{q.prompt}</Link>
                  <p className="tabular text-muted">Answer: {q.question_answers?.answer_amount ? formatUsd(q.question_answers.answer_amount) : "missing"}</p>
                  <div className="flex gap-2"><StatusPill status={q.status} /><StatusPill status={q.question_answers?.verification_status ?? "unverified"} /></div>
                </div>
              ) : <p className="mt-2 flex-1 text-sm text-muted">Empty</p>}
              {draft ? (
                <AdminForm action={assignQuestionAction} submitLabel={q ? "Replace" : "Assign"} variant="secondary" className="mt-3 space-y-2">
                  <input type="hidden" name="set_id" value={set.id} />
                  <input type="hidden" name="position" value={position} />
                  <Select id={`assign-${position}`} name="question_id" aria-label={`Question for position ${position}`} defaultValue="">
                    <option value="">{q ? "— Remove question —" : "Choose an approved question…"}</option>
                    {candidates.filter((c) => c.difficulty === difficulty).map((c) => (
                      <option key={c.id} value={c.id}>{c.prompt.slice(0, 90)}</option>
                    ))}
                  </Select>
                </AdminForm>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Publication checks</h2>
        {draft || set.status === "scheduled" ? (
          issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-accent-strong"><CheckCircle2 aria-hidden className="size-4" /> All checks pass: three approved, verified, sourced questions in the right positions.</p>
          ) : (
            <ul className="space-y-1 text-sm text-error">
              {issues.map((i) => <li key={i} className="flex items-center gap-2"><XCircle aria-hidden className="size-4" /> {describeIssue(i)}</li>)}
            </ul>
          )
        ) : <p className="text-sm text-muted">This set is {set.status}.</p>}
      </Card>

      {draft ? (
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Publish</h2>
          <p className="mb-3 text-sm text-muted">
            {set.game_date <= today ? "Publishing makes this set live immediately." : "The set will be scheduled and goes live automatically at midnight Eastern Time on its date."} Questions become locked. Type the game date to confirm.
          </p>
          <AdminForm action={publishSetAction} submitLabel="Publish set" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="set_id" value={set.id} />
            <Field id="confirm_date" label={`Type ${set.game_date}`}><TextInput id="confirm_date" name="confirm_date" autoComplete="off" placeholder="YYYY-MM-DD" /></Field>
          </AdminForm>
        </Card>
      ) : null}
      {set.status === "scheduled" && set.game_date > today ? (
        <AdminForm action={unscheduleSetAction} submitLabel="Return to draft" variant="secondary">
          <input type="hidden" name="set_id" value={set.id} />
        </AdminForm>
      ) : null}
      {["published", "scheduled"].includes(set.status) && set.game_date <= today ? (
        <Alert tone="info">This set is live. Fix errors through each question&apos;s correction workflow.</Alert>
      ) : null}

      {members.length ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Player preview</h2>
          {members.filter((m) => m.questions).map((m) => (
            <Card key={m.position} className="tag-notch p-5">
              <QuestionView question={{ id: m.questions!.id, position: m.position as 1 | 2 | 3, difficulty: m.questions!.difficulty, prompt: m.questions!.prompt, context: m.questions!.context, imageUrl: m.questions!.image_url, imageAlt: m.questions!.image_alt, imageCredit: m.questions!.image_credit, withdrawn: m.questions!.status === "withdrawn", correctionNote: m.questions!.correction_note }} />
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
