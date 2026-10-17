import Link from "next/link";
import { listDailySets, ADMIN_PAGE } from "@/lib/admin/queries";
import { createDailySetAction } from "@/lib/admin/actions";
import { addDays, formatGameDate, getGameDate } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/field";
import { AdminForm } from "@/components/admin/admin-form";
import { StatusPill } from "@/components/admin/status-pill";

export const metadata = { title: "Daily sets" };

export default async function DailySetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, count } = await listDailySets(page);
  const today = getGameDate();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Daily sets</h1>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Create a set</h2>
        <AdminForm action={createDailySetAction} submitLabel="Create draft set" className="flex flex-wrap items-end gap-3">
          <Field id="game_date" label="Game date (Eastern Time)"><TextInput id="game_date" name="game_date" type="date" min={today} defaultValue={addDays(today, 1)} /></Field>
          <Field id="notes" label="Notes (optional)" className="min-w-64 flex-1"><TextInput id="notes" name="notes" /></Field>
        </AdminForm>
      </Card>
      <Card>
        <ul className="divide-y divide-border">
          {rows.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/daily-sets/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-muted/60">
                <span>{formatGameDate(s.game_date)}{s.game_date === today ? " (today)" : ""}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted">{(s.daily_set_questions as unknown[]).length}/3 questions</span>
                  {s.is_sample ? <StatusPill status="sample" /> : null}
                  <StatusPill status={s.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <nav className="flex justify-between text-sm">
        {page > 1 ? <Link className="text-accent-strong" href={`/admin/daily-sets?page=${page - 1}`}>← Newer</Link> : <span />}
        {page * ADMIN_PAGE < count ? <Link className="text-accent-strong" href={`/admin/daily-sets?page=${page + 1}`}>Older →</Link> : <span />}
      </nav>
    </div>
  );
}
