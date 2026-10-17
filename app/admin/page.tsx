import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getOverview } from "@/lib/admin/queries";
import { markFeedbackReviewedAction } from "@/lib/admin/actions";
import { formatGameDate } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusPill } from "@/components/admin/status-pill";
import { ButtonLink } from "@/components/ui/button";

export default async function AdminOverview() {
  const o = await getOverview();
  const todaySet = o.upcoming[0].set;
  const tomorrow = o.upcoming[1];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <div className="flex gap-2">
          <ButtonLink href="/admin/questions/new" size="sm">New question</ButtonLink>
          <ButtonLink href="/admin/daily-sets" size="sm" variant="secondary">Schedule a set</ButtonLink>
        </div>
      </div>

      {!todaySet || !["published", "scheduled"].includes(todaySet.status) ? (
        <Alert tone="error" title="No game is live today">Players see an "unavailable" message. Create and publish a set for {formatGameDate(o.today, "medium")}.</Alert>
      ) : null}
      {!tomorrow.set || tomorrow.set.status === "draft" ? (
        <Alert tone="warning" title="Tomorrow isn't ready">No published set for {formatGameDate(tomorrow.date, "medium")} yet.</Alert>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Published questions", o.publishedCount],
          ["Drafts", o.draftCount],
          ["Awaiting verification", o.unverifiedCount],
          ["Completed games today (accounts)", o.completedToday],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{v}</dd>
          </Card>
        ))}
      </dl>

      <section>
        <h2 className="mb-3 font-semibold">Publication calendar (next 14 days, Eastern Time)</h2>
        <Card>
          <ul className="divide-y divide-border">
            {o.upcoming.map(({ date, set }) => (
              <li key={date} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{formatGameDate(date)}{date === o.today ? " (today)" : ""}</span>
                {set ? (
                  <Link href={`/admin/daily-sets/${set.id}`} className="flex items-center gap-2 hover:underline">
                    {set.is_sample ? <StatusPill status="sample" /> : null}
                    <StatusPill status={set.status} />
                  </Link>
                ) : (
                  <StatusPill status="missing" />
                )}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {o.missingSources.length ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle aria-hidden className="size-4 text-warning" /> Questions without sources</h2>
          <Card>
            <ul className="divide-y divide-border">
              {o.missingSources.slice(0, 10).map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link href={`/admin/questions/${q.id}`} className="truncate hover:underline">{q.prompt}</Link>
                  <StatusPill status={q.status} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">Recent admin activity</h2>
          <Card>
            {o.audit.length === 0 ? <p className="p-4 text-sm text-muted">No activity yet.</p> : (
              <ul className="divide-y divide-border">
                {o.audit.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <span className="font-mono text-xs">{a.action}</span>
                    <span className="block text-xs text-muted">{new Date(a.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET{a.admin_user_id ? "" : " · system"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
        <section>
          <h2 className="mb-3 font-semibold">Player feedback</h2>
          <Card>
            {o.feedback.length === 0 ? <p className="p-4 text-sm text-muted">No feedback yet.</p> : (
              <ul className="divide-y divide-border">
                {o.feedback.map((f) => (
                  <li key={f.id} className="space-y-1 px-4 py-3 text-sm">
                    <p className="whitespace-pre-wrap text-ink">{f.message}</p>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span>{f.contact ? `Reply to: ${f.contact}` : "No reply address"} · {new Date(f.created_at).toLocaleDateString("en-US")}</span>
                      {f.status === "new" ? (
                        <form action={markFeedbackReviewedAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <button className="text-accent-strong hover:underline">Mark reviewed</button>
                        </form>
                      ) : <span>Reviewed</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
