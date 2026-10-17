import Link from "next/link";
import { listQuestions, ADMIN_PAGE } from "@/lib/admin/queries";
import { formatUsd } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/field";
import { StatusPill } from "@/components/admin/status-pill";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Questions" };

export default async function AdminQuestions({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = ["draft", "approved", "published", "withdrawn", "archived"].includes(sp.status ?? "") ? sp.status : undefined;
  const difficulty = ["easy", "medium", "hard"].includes(sp.difficulty ?? "") ? sp.difficulty : undefined;
  const q = sp.q?.slice(0, 100);
  const { rows, count } = await listQuestions({ status, difficulty, q, page });
  const pages = Math.max(1, Math.ceil(count / ADMIN_PAGE));
  const qs = (p: number) => `/admin/questions?${new URLSearchParams({ ...(status ? { status } : {}), ...(difficulty ? { difficulty } : {}), ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Questions <span className="text-base font-normal text-muted">({count})</span></h1>
        <ButtonLink href="/admin/questions/new" size="sm">New question</ButtonLink>
      </div>
      <form className="flex flex-wrap gap-2" role="search">
        <TextInput id="q" name="q" placeholder="Search prompts" defaultValue={q} aria-label="Search prompts" className="max-w-xs" />
        <Select id="status" name="status" defaultValue={status ?? ""} aria-label="Status" className="w-40">
          <option value="">All statuses</option>
          {["draft", "approved", "published", "withdrawn", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select id="difficulty" name="difficulty" defaultValue={difficulty ?? ""} aria-label="Difficulty" className="w-40">
          <option value="">All difficulties</option>
          {["easy", "medium", "hard"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <button className="h-11 rounded-[var(--radius)] border border-border-strong bg-surface px-4 text-sm font-medium">Filter</button>
      </form>
      {rows.length === 0 ? <EmptyState title="No questions match" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Question</th>
                <th className="px-2 py-2.5 font-medium">Difficulty</th>
                <th className="px-2 py-2.5 font-medium">Answer</th>
                <th className="px-2 py-2.5 font-medium">Verification</th>
                <th className="px-2 py-2.5 font-medium">Sources</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = r.question_answers as unknown as { answer_amount: string | null; verification_status: string } | null;
                const set = (r.daily_set_questions as unknown as { daily_sets: { game_date: string } | null } | null)?.daily_sets;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 align-top">
                    <td className="max-w-md px-4 py-3">
                      <Link href={`/admin/questions/${r.id}`} className="font-medium text-ink hover:underline">{r.prompt}</Link>
                      <span className="block text-xs text-muted">
                        {(r.categories as unknown as { name: string } | null)?.name ?? "No category"}
                        {set ? ` · Set ${set.game_date}` : ""}{r.ai_assisted ? " · AI-assisted" : ""}{r.is_sample ? " · Sample" : ""}
                      </span>
                    </td>
                    <td className="px-2 py-3 capitalize">{r.difficulty}</td>
                    <td className="tabular px-2 py-3">{a?.answer_amount ? formatUsd(a.answer_amount) : "—"}</td>
                    <td className="px-2 py-3"><StatusPill status={a?.verification_status ?? "unverified"} /></td>
                    <td className="px-2 py-3">{(r.question_sources as unknown[]).length}</td>
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      {pages > 1 ? (
        <nav className="flex justify-between text-sm" aria-label="Pages">
          {page > 1 ? <Link href={qs(page - 1)} className="text-accent-strong">← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={qs(page + 1)} className="text-accent-strong">Next →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
