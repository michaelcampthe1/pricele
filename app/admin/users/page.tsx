import Link from "next/link";
import { searchUsers } from "@/lib/admin/queries";
import { setSuspensionAction } from "@/lib/admin/actions";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/field";
import { AdminForm } from "@/components/admin/admin-form";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 60);
  const users = await searchUsers(q);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="text-sm text-muted">Search by username or display name. Email addresses, passwords and tokens are not shown here. Administrator roles are managed with the <code>admin:grant</code> / <code>admin:revoke</code> scripts, not from the web.</p>
      <form role="search" className="flex gap-2">
        <TextInput id="q" name="q" defaultValue={q} placeholder="Search players" aria-label="Search players" className="max-w-sm" />
        <button className="h-11 rounded-[var(--radius)] border border-border-strong bg-surface px-4 text-sm font-medium">Search</button>
      </form>
      {users.length === 0 ? <EmptyState title="No players found" /> : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} className="flex flex-col gap-3 p-4 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">
                  {u.is_public ? <Link href={`/profile/${u.username}`} className="hover:underline">@{u.username}</Link> : `@${u.username}`}
                  {u.display_name ? <span className="text-muted"> · {u.display_name}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  Joined {new Date(u.created_at).toLocaleDateString("en-US")} · {u.games} completed games · {u.is_public ? "public" : "private"} profile
                  {u.isAdmin ? " · administrator" : ""}
                </p>
                {u.suspended_at ? <p className="mt-1 text-xs text-error">Suspended: {u.suspended_reason}</p> : null}
              </div>
              {u.suspended_at ? (
                <AdminForm action={setSuspensionAction} submitLabel="Lift suspension" variant="secondary">
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="suspend" value="false" />
                </AdminForm>
              ) : (
                <AdminForm action={setSuspensionAction} submitLabel="Suspend" variant="danger" className="flex items-end gap-2">
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="suspend" value="true" />
                  <TextInput id={`reason-${u.id}`} name="reason" placeholder="Reason (logged)" aria-label={`Suspension reason for ${u.username}`} className="h-9 w-56" />
                </AdminForm>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
