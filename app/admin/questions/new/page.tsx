import { listCategories } from "@/lib/admin/queries";
import { serverEnv } from "@/lib/env.server";
import { NewQuestion } from "@/components/admin/question-editor";

export const metadata = { title: "New question" };

export default async function NewQuestionPage() {
  const categories = (await listCategories()).filter((c) => c.is_active);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">New question</h1>
      <NewQuestion categories={categories} aiEnabled={Boolean(serverEnv().aiApiKey)} />
    </div>
  );
}
