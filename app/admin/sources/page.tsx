import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { listSourceIssues } from "@/lib/admin/queries";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/admin/status-pill";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Sources" };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const all = await listSourceIssues();
  const showAll = sp.all === "1";
  const rows = showAll ? all : all.filter((r) => r.problems.length > 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Source review</h1>
        <Link href={showAll ? "/admin/sources" : "/admin/sources?all=1"} className="text-sm text-accent-strong hover:underline">
          {showAll ? "Show only problems" : "Show all questions"}
        </Link>
      </div>
      <p className="text-sm text-muted">A URL alone never makes a question verified. Open each source and confirm it supports the exact amount and definition. If a source disappears, its recorded title, publisher and excerpt remain here.</p>
      {rows.length === 0 ? <EmptyState title="No source problems" /> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="space-y-2 p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/admin/questions/${r.id}`} className="font-medium hover:underline">{r.prompt}</Link>
                <StatusPill status={r.status} />
              </div>
              {r.problems.length ? <p className="text-warning">{r.problems.join(" · ")}</p> : <p className="text-accent-strong">No problems found.</p>}
              <ul className="space-y-1">
                {r.sources.map((s) => (
                  <li key={s.id}>
                    <a href={s.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-accent-strong hover:underline">
                      {s.publisher} — {s.title} <ExternalLink aria-hidden className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
