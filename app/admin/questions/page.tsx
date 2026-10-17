import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { DIFFICULTY_LABEL } from "@/lib/game/types";
import { formatGameDate } from "@/lib/dates";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Select, TextInput } from "@/components/ui/form";
import { CategoryForm } from "@/components/admin/category-form";

export const metadata = { title: "Questions" };

const STATUSES = ["draft", "approved", "published", "archived"];
const PAGE = 50;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? sp.status! : null;
  const difficulty = ["easy", "medium", "hard"].includes(sp.difficulty ?? "") ? sp.difficulty! : null;
  const search = sp.q?.trim().slice(0, 100) || null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [{ total, items }, categories] = await Promise.all([
    admin.listQuestions(me.id, { status, difficulty, search, limit: PAGE, offset: (page - 1) * PAGE }),
    admin.categories(me.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Questions</h1>
        <ButtonLink href="/admin/questions/new">New question</ButtonLink>
      </div>

      <form className="grid gap-3 rounded-[12px] border border-line bg-surface p-4 sm:grid-cols-[1fr_10rem_10rem_auto]" role="search">
        <div>
          <label htmlFor="q" className="sr-only">Search prompts</label>
          <TextInput id="q" name="q" placeholder="Search prompts" defaultValue={search ?? ""} />
        </div>
        <div>
          <label htmlFor="status" className="sr-only">Status</label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="difficulty" className="sr-only">Difficulty</label>
          <Select id="difficulty" name="difficulty" defaultValue={difficulty ?? ""}>
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </div>
        <button type="submit" className="rounded-[10px] bg-ink px-4 py-2.5 text-sm font-semibold text-white">Filter</button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="No questions match" action={<ButtonLink href="/admin/questions/new">Create a question</ButtonLink>}>
          Adjust the filters or add a new question.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2.5 font-medium">Prompt</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Difficulty</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Answer</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Sources</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id} className="border-b border-line last:border-0 hover:bg-green-wash">
                  <td className="max-w-md px-4 py-3">
                    <Link href={`/admin/questions/${q.id}`} className="font-medium text-ink hover:underline">{q.prompt}</Link>
                    <p className="text-xs text-muted">
                      {q.category}
                      {q.isSample && " · sample"}
                      {q.problemCount > 0 && <span className="text-amber"> · {q.problemCount} issue{q.problemCount > 1 && "s"}</span>}
                    </p>
                  </td>
                  <td className="px-2 py-3">{DIFFICULTY_LABEL[q.difficulty]}</td>
                  <td className="px-2 py-3"><StatusBadge status={q.status} /></td>
                  <td className="px-2 py-3"><StatusBadge status={q.verificationStatus ?? "missing"} /></td>
                  <td className="tnum px-2 py-3">{q.sourceCount}</td>
                  <td className="px-4 py-3 text-muted">{q.gameDate ? formatGameDate(q.gameDate, "weekday") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between text-sm text-muted">
        <span>{total} total</span>
        <span className="flex gap-4">
          {page > 1 && <Link className="underline" href={`?${new URLSearchParams({ ...(status && { status }), ...(difficulty && { difficulty }), ...(search && { q: search }), page: String(page - 1) })}`}>Previous</Link>}
          {page * PAGE < total && <Link className="underline" href={`?${new URLSearchParams({ ...(status && { status }), ...(difficulty && { difficulty }), ...(search && { q: search }), page: String(page + 1) })}`}>Next</Link>}
        </span>
      </div>

      <section className="rounded-[12px] border border-line bg-surface p-5">
        <h2 className="font-semibold">Categories</h2>
        <p className="mt-1 text-sm text-muted">{categories.map((c) => c.name).join(", ")}</p>
        <div className="mt-4 max-w-sm">
          <CategoryForm />
        </div>
      </section>
    </div>
  );
}
