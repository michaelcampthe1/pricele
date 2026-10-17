import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { formatGameDate, formatTimestamp } from "@/lib/dates";
import { Stat, Alert } from "@/components/ui/misc";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const me = await requireAdmin();
  const o = await admin.overview(me.id);
  const todayLive = o.todaySet && ["published", "scheduled"].includes(o.todaySet.status);
  const missing = o.upcoming.filter((u) => !u.set || !["published", "scheduled"].includes(u.set.status));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-muted">Today is {formatGameDate(o.today)} (Eastern Time).</p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/admin/questions/new">New question</ButtonLink>
          <ButtonLink href="/admin/daily-sets" variant="secondary">
            Daily sets
          </ButtonLink>
        </div>
      </div>

      {!todayLive ? (
        <Alert tone="error" title="Today's game is not published">
          Players see a &quot;not ready yet&quot; message. Create or finish today&apos;s set in{" "}
          <Link href={o.todaySet ? `/admin/daily-sets/${o.todaySet.id}` : "/admin/daily-sets"}>Daily sets</Link>.
        </Alert>
      ) : missing.length > 0 ? (
        <Alert tone="warning" title={`${missing.length} of the next 14 days have no published set`}>
          Next gap: {formatGameDate(missing[0].date, "weekday")}.
        </Alert>
      ) : (
        <Alert tone="success" title="The next 14 days are published." />
      )}

      <section aria-labelledby="schedule">
        <h2 id="schedule" className="font-display text-xl font-semibold">
          Publication schedule
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {o.upcoming.map((u) => (
            <li key={u.date}>
              <Link
                href={u.set ? `/admin/daily-sets/${u.set.id}` : `/admin/daily-sets?date=${u.date}`}
                className="block rounded-[10px] border border-line bg-surface p-3 text-sm hover:border-line-strong"
              >
                <p className="font-medium">{formatGameDate(u.date, "weekday")}</p>
                <div className="mt-1.5">
                  {u.set ? <StatusBadge status={u.set.status} /> : <StatusBadge status="missing" />}
                </div>
                {u.set && u.set.status === "draft" && <p className="mt-1 text-xs text-muted">{u.set.questionCount}/3 questions</p>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="content">
        <h2 id="content" className="font-display text-xl font-semibold">
          Question pipeline
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Published" value={o.counts.published} />
          <Stat label="Approved, unused" value={o.counts.approvedUnused} />
          <Stat label="Drafts" value={o.counts.drafts} />
          <Stat label="Awaiting verification" value={o.counts.awaitingVerification} />
          <Stat label="Source problems" value={o.counts.sourceProblems} />
          <Stat label="Open player reports" value={o.counts.openReports} />
        </dl>
      </section>

      <section aria-labelledby="usage">
        <h2 id="usage" className="font-display text-xl font-semibold">
          Usage
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Players today" value={o.usage.todayPlayers} hint="Accounts and guest sessions with a guess" />
          <Stat label="Completions today" value={o.usage.todayCompletions} hint="Signed-in players who finished" />
          <Stat label="Completions, last 7 days" value={o.usage.last7DaysCompletions} />
          <Stat label="Registered players" value={o.usage.registeredUsers} />
        </dl>
      </section>

      <section aria-labelledby="activity">
        <div className="flex items-baseline justify-between">
          <h2 id="activity" className="font-display text-xl font-semibold">
            Recent admin activity
          </h2>
          <Link href="/admin/audit" className="text-sm font-medium text-green-strong underline">
            Full audit log
          </Link>
        </div>
        {o.recentActivity.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No admin activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-[12px] border border-line bg-surface text-sm">
            {o.recentActivity.map((a, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span>
                  <span className="font-medium">{a.action}</span> <span className="text-muted">by {a.admin ?? "system"}</span>
                </span>
                <span className="text-muted">{formatTimestamp(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
