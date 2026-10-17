import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { formatTimestamp } from "@/lib/dates";
import { TextInput } from "@/components/ui/form";
import { SuspendForm } from "@/components/admin/suspend-form";
import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const users = await admin.searchUsers(me.id, q, 50);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Users</h1>
      <p className="text-sm text-muted">
        Search by username or email prefix. Passwords and tokens are never visible here. Admin roles are granted only with the
        bootstrap script (see README).
      </p>
      <form role="search" className="flex max-w-lg gap-2">
        <label htmlFor="q" className="sr-only">Search users</label>
        <TextInput id="q" name="q" defaultValue={q} placeholder="username or email" />
        <button type="submit" className="rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">Search</button>
      </form>
      {users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <ul className="space-y-3">
          {users.map((u) => (
            <li key={u.id} className="grid gap-3 rounded-[12px] border border-line bg-surface p-4 text-sm md:grid-cols-[1fr_22rem]">
              <div>
                <p className="font-medium">
                  {u.isPublic ? <Link href={`/profile/${u.username}`} className="hover:underline">@{u.username}</Link> : `@${u.username}`}
                  {u.isAdmin && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-xs text-white">admin</span>}
                  {u.suspendedAt && <span className="ml-2 rounded-full bg-red-tint px-2 py-0.5 text-xs text-red">suspended</span>}
                </p>
                <p className="text-muted">{u.email}</p>
                <p className="mt-1 text-xs text-muted">
                  Joined {formatTimestamp(u.createdAt)} · {u.gamesCompleted} games ·{" "}
                  {u.lastPlayedAt ? `last played ${formatTimestamp(u.lastPlayedAt)}` : "never played"}
                </p>
                {u.suspensionReason && <p className="mt-1 text-xs text-red">Reason: {u.suspensionReason}</p>}
              </div>
              {u.id !== me.id && <SuspendForm userId={u.id} suspended={Boolean(u.suspendedAt)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
