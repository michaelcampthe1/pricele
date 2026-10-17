import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { formatTimestamp } from "@/lib/dates";
import { StatusBadge } from "@/components/admin/status-badge";
import { resolveReportAction } from "@/app/admin/actions";

export const metadata = { title: "Sources and reports" };

export default async function SourcesPage() {
  const me = await requireAdmin();
  const r = await admin.sourceReview(me.id);
  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Sources and reports</h1>

      <section aria-labelledby="reports">
        <h2 id="reports" className="font-display text-xl font-semibold">Open player reports ({r.reports.length})</h2>
        {r.reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No open reports.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {r.reports.map((rep) => (
              <li key={rep.id} className="rounded-[12px] border border-line bg-surface p-4 text-sm">
                <Link href={`/admin/questions/${rep.questionId}`} className="font-medium hover:underline">{rep.prompt}</Link>
                <p className="mt-1 text-ink-soft">“{rep.message}”</p>
                <p className="mt-1 text-xs text-muted">{formatTimestamp(rep.createdAt)}</p>
                <div className="mt-2 flex gap-3">
                  {(["resolved", "dismissed"] as const).map((s) => (
                    <form key={s} action={resolveReportAction}>
                      <input type="hidden" name="reportId" value={rep.id} />
                      <input type="hidden" name="status" value={s} />
                      <button type="submit" className="text-sm font-medium text-green-strong underline">
                        Mark {s}
                      </button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="problems">
        <h2 id="problems" className="font-display text-xl font-semibold">Questions with missing or incomplete sourcing ({r.problemQuestions.length})</h2>
        {r.problemQuestions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Every draft and approved question has complete sourcing.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-[12px] border border-line bg-surface text-sm">
            {r.problemQuestions.map((q) => (
              <li key={q.id} className="px-4 py-3">
                <Link href={`/admin/questions/${q.id}`} className="font-medium hover:underline">{q.prompt}</Link>{" "}
                <StatusBadge status={q.status} />
                <p className="mt-1 text-amber">{q.problems.join("; ")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-sources">
        <h2 id="recent-sources" className="font-display text-xl font-semibold">Recent sources</h2>
        <div className="mt-3 overflow-x-auto rounded-[12px] border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Question</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Excerpt</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Verified</th>
              </tr>
            </thead>
            <tbody>
              {r.sources.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-medium text-green-strong underline">
                      <ExternalLink aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.title}
                    </a>
                    <p className="text-xs text-muted">{s.publisher}</p>
                  </td>
                  <td className="max-w-xs px-2 py-3">
                    <Link href={`/admin/questions/${s.questionId}`} className="hover:underline">{s.prompt}</Link>
                  </td>
                  <td className="px-2 py-3">{s.hasExcerpt ? "Yes" : <span className="text-amber">No</span>}</td>
                  <td className="px-4 py-3">{s.verifiedAt ? formatTimestamp(s.verifiedAt) : <StatusBadge status="unverified" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
