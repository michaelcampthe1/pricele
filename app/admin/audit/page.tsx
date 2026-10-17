import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { formatTimestamp } from "@/lib/dates";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null;
  const rows = await admin.auditLog(me.id, 50, before);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Audit log</h1>
      <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-2.5 font-medium">When</th>
              <th scope="col" className="px-2 py-2.5 font-medium">Admin</th>
              <th scope="col" className="px-2 py-2.5 font-medium">Action</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatTimestamp(r.createdAt)}</td>
                <td className="px-2 py-2.5">{r.admin ?? "system"}</td>
                <td className="px-2 py-2.5 font-medium">
                  {r.action}
                  {r.entityType === "question" && r.entityId && (
                    <Link href={`/admin/questions/${r.entityId}`} className="ml-2 text-xs text-green-strong underline">open</Link>
                  )}
                  {r.entityType === "daily_set" && r.entityId && (
                    <Link href={`/admin/daily-sets/${r.entityId}`} className="ml-2 text-xs text-green-strong underline">open</Link>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <code className="break-all text-xs text-ink-soft">{JSON.stringify(r.details)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 50 && (
        <Link href={`/admin/audit?before=${encodeURIComponent(rows[rows.length - 1].createdAt)}`} className="text-sm font-medium text-green-strong underline">
          Older entries
        </Link>
      )}
    </div>
  );
}
