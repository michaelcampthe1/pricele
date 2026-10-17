import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { formatGameDate, formatTimestamp } from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import { DIFFICULTY_LABEL } from "@/lib/game/types";
import { StatusBadge } from "@/components/admin/status-badge";
import { AssignForm, PublishForm, UnpublishForm } from "@/components/admin/set-panels";
import { Alert, DifficultyLabel } from "@/components/ui/misc";
import { deleteSetAction, unassignQuestionAction } from "@/app/admin/actions";

export const metadata = { title: "Daily set" };

export default async function DailySetPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const set = await admin.getDailySet(me.id, id);
  if (!set) notFound();
  const draft = set.status === "draft";
  const bySlot = new Map(set.questions.map((q) => [q.position, q]));

  return (
    <div className="space-y-6">
      <Link href="/admin/daily-sets" className="text-sm text-muted hover:text-ink">
        ← Daily sets
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">{formatGameDate(set.gameDate)}</h1>
        <StatusBadge status={set.status} />
        {set.version > 0 && <span className="text-sm text-muted">Version {set.version}</span>}
      </div>
      {set.publishedAt && (
        <p className="text-sm text-muted">
          Published {formatTimestamp(set.publishedAt)} by {set.publishedBy ?? "unknown"}.{" "}
          {set.status === "scheduled" && "It goes live at midnight ET on its date."}
        </p>
      )}

      <section aria-labelledby="slots" className="space-y-3">
        <h2 id="slots" className="font-display text-lg font-semibold">Questions</h2>
        {[1, 2, 3].map((pos) => {
          const q = bySlot.get(pos as 1 | 2 | 3);
          const difficulty = (["easy", "medium", "hard"] as const)[pos - 1];
          return (
            <div key={pos} className="tag flex flex-wrap items-start justify-between gap-4 py-4 pl-11 pr-5">
              {q ? (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DifficultyLabel difficulty={q.difficulty} />
                    <span className="text-sm text-muted">{q.category}</span>
                    <StatusBadge status={q.verificationStatus ?? "missing"} />
                    {q.isSample && <span className="text-xs text-amber">Sample</span>}
                  </div>
                  <Link href={`/admin/questions/${q.id}`} className="mt-1 block font-medium hover:underline">
                    {q.prompt}
                  </Link>
                  <p className="tnum mt-1 text-sm text-ink-soft">
                    Answer: {q.answer ? formatUsd(q.answer) : "missing"}, {q.answerDefinition}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">{DIFFICULTY_LABEL[difficulty]} slot is empty.</p>
              )}
              {q && draft && (
                <form action={unassignQuestionAction}>
                  <input type="hidden" name="setId" value={set.id} />
                  <input type="hidden" name="position" value={pos} />
                  <button type="submit" className="text-sm font-medium text-red underline">Remove</button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {draft && (
          <section className="rounded-[14px] border border-line bg-surface p-5">
            <h2 className="mb-3 font-semibold">Assign a question</h2>
            <AssignForm setId={set.id} candidates={set.candidates} />
          </section>
        )}
        <section className="space-y-4 rounded-[14px] border border-line bg-surface p-5">
          <h2 className="font-semibold">Validation</h2>
          {set.validation.ok ? (
            <Alert tone="success" title="Ready to publish" />
          ) : draft ? (
            <Alert tone="error" title="Can't publish yet">
              <ul className="list-disc pl-4">
                {set.validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {set.validation.warnings.length > 0 && (
            <Alert tone="warning" title="Variety hints">
              <ul className="list-disc pl-4">
                {set.validation.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}
          {draft ? (
            <PublishForm setId={set.id} gameDate={formatGameDate(set.gameDate, "short")} />
          ) : set.status === "scheduled" || set.status === "published" ? (
            <>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-muted">Players</dt><dd className="tnum font-semibold">{set.stats.players}</dd></div>
                <div><dt className="text-muted">Completions</dt><dd className="tnum font-semibold">{set.stats.completions}</dd></div>
                <div><dt className="text-muted">Avg score</dt><dd className="tnum font-semibold">{set.stats.averageScore ?? "—"}</dd></div>
              </dl>
              {set.stats.players === 0 && <UnpublishForm setId={set.id} />}
            </>
          ) : null}
          {draft && (
            <form action={deleteSetAction}>
              <input type="hidden" name="setId" value={set.id} />
              <button type="submit" className="text-sm font-medium text-red underline">Delete this draft set</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
