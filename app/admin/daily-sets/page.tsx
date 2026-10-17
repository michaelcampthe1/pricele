import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { addDays, formatGameDate, gameDateFor, isGameDateString } from "@/lib/dates";
import { StatusBadge } from "@/components/admin/status-badge";
import { CreateSetForm } from "@/components/admin/set-panels";
import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "Daily sets" };

export default async function DailySetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const today = gameDateFor();
  const sets = await admin.listDailySets(me.id, addDays(today, -60), addDays(today, 366));
  const suggested = isGameDateString(sp.date) ? sp.date : today;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Daily sets</h1>
      <section className="max-w-md rounded-[14px] border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Create a set</h2>
        <CreateSetForm defaultDate={suggested} minDate={today} />
      </section>
      {sets.length === 0 ? (
        <EmptyState title="No daily sets yet">Create today&apos;s set to make the game playable.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Questions</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Players</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Completions</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Published by</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {sets.map((s) => (
                <tr key={s.id} className={`border-b border-line last:border-0 hover:bg-green-wash ${s.gameDate === today ? "bg-sunk" : ""}`}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/daily-sets/${s.id}`} className="font-medium hover:underline">
                      {formatGameDate(s.gameDate, "weekday")}
                    </Link>
                    {s.gameDate === today && <span className="ml-2 text-xs text-green-strong">Today</span>}
                  </td>
                  <td className="px-2 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-2 py-3">{s.questionCount}/3</td>
                  <td className="px-2 py-3">{s.players}</td>
                  <td className="px-2 py-3">{s.completions}</td>
                  <td className="px-4 py-3 text-muted">{s.publishedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
