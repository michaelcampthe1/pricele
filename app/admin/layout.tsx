import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Pricele" }, robots: { index: false, follow: false } };

/** Every admin route is gated here on the server; actions and DB functions check again. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <AdminNav />
      <div className="mt-8">{children}</div>
    </div>
  );
}
