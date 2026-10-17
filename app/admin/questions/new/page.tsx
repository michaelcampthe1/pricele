import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { admin } from "@/lib/admin/service";
import { aiConfigured } from "@/lib/ai/suggest";
import { NewQuestion } from "@/components/admin/new-question";

export const metadata = { title: "New question" };

export default async function NewQuestionPage() {
  const me = await requireAdmin();
  const categories = await admin.categories(me.id);
  return (
    <div className="space-y-6">
      <Link href="/admin/questions" className="text-sm text-muted hover:text-ink">
        ← Questions
      </Link>
      <h1 className="font-display text-2xl font-bold tracking-tight">New question</h1>
      <NewQuestion categories={categories.filter((c) => c.isActive)} aiEnabled={aiConfigured()} />
    </div>
  );
}
