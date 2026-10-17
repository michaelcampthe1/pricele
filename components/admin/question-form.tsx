"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { saveQuestionAction } from "@/app/admin/actions";
import { Field, Select, TextArea, TextInput } from "@/components/ui/form";
import type { AdminQuestion } from "@/lib/admin/service";
import { amountInWords, formatUsd, parseUsdInput } from "@/lib/money";

export type QuestionDraft = Partial<{
  prompt: string;
  context: string | null;
  difficulty: "easy" | "medium" | "hard";
  categoryId: string;
  answerDefinition: string;
  explanation: string;
}>;

export function QuestionForm({
  question,
  categories,
  draft,
}: {
  question?: AdminQuestion | null;
  categories: { id: string; name: string }[];
  draft?: QuestionDraft;
}) {
  const [amount, setAmount] = useState(question?.answer?.amount ?? "");
  const [image, setImage] = useState(question?.imageUrl ?? "");
  const parsed = amount ? parseUsdInput(amount) : null;
  const d = draft ?? {};
  return (
    <ActionForm
      action={saveQuestionAction}
      submitLabel={question ? "Save changes" : "Create draft"}
      hidden={question ? { id: question.id } : {}}
      render={(s) => (
        <div className="space-y-5">
          <fieldset className="space-y-4">
            <legend className="mb-2 font-semibold">Picture of the item (required)</legend>
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <div className="space-y-4">
                <Field
                  id="imageUrl"
                  label="Image link"
                  hint="An https:// link to a photo you have the right to use, or a bundled picture like /items/phone.svg."
                  error={s.fieldErrors?.imageUrl}
                >
                  <TextInput id="imageUrl" value={image} onChange={(e) => setImage(e.target.value)} error={s.fieldErrors?.imageUrl} hint />
                </Field>
                <Field id="imageAlt" label="Describe the picture" hint="Read aloud by screen readers. Don't give away the price." error={s.fieldErrors?.imageAlt}>
                  <TextInput id="imageAlt" maxLength={200} defaultValue={question?.imageAlt ?? ""} error={s.fieldErrors?.imageAlt} hint />
                </Field>
                <Field id="imageCredit" label="Photo credit" optional error={s.fieldErrors?.imageCredit}>
                  <TextInput id="imageCredit" maxLength={200} defaultValue={question?.imageCredit ?? ""} error={s.fieldErrors?.imageCredit} />
                </Field>
              </div>
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[10px] border border-line bg-[#eceee8] text-center text-xs text-muted">
                {/^(https:\/\/\S+|\/items\/\S+)$/.test(image) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="p-3">Picture preview appears here</span>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-2 font-semibold">Player-facing question</legend>
            <Field id="prompt" label="Question" hint="Ask for one unambiguous USD amount." error={s.fieldErrors?.prompt}>
              <TextArea id="prompt" rows={2} maxLength={300} defaultValue={question?.prompt ?? d.prompt ?? ""} error={s.fieldErrors?.prompt} />
            </Field>
            <Field id="context" label="Context" optional hint="Clarify the exact product, date, retailer or financial definition." error={s.fieldErrors?.context}>
              <TextArea id="context" rows={2} maxLength={600} defaultValue={question?.context ?? d.context ?? ""} error={s.fieldErrors?.context} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="difficulty"
                label="Difficulty"
                hint="Easy: things most people buy (trash bags, a new iPhone). Medium: familiar but pricier or rarer buys (a car, a stand mixer). Hard: famous one-offs (record auctions, landmark buildings)."
                error={s.fieldErrors?.difficulty}
              >
                <Select id="difficulty" defaultValue={question?.difficulty ?? d.difficulty ?? ""}>
                  <option value="" disabled>Choose…</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
              </Field>
              <Field id="categoryId" label="Category" error={s.fieldErrors?.categoryId}>
                <Select id="categoryId" defaultValue={question?.categoryId ?? d.categoryId ?? ""}>
                  <option value="" disabled>Choose…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 rounded-[12px] border border-amber/30 bg-amber-tint/40 p-4">
            <legend className="px-1 font-semibold">Answer key (never shown before a player submits)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="answerAmount"
                label="Target amount (USD)"
                hint={parsed?.ok ? `${formatUsd(parsed.value)}${amountInWords(parsed.value) ? ` (${amountInWords(parsed.value)})` : ""}` : "Exact amount the source supports."}
                error={s.fieldErrors?.answerAmount}
              >
                <TextInput id="answerAmount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={s.fieldErrors?.answerAmount} hint />
              </Field>
              <Field id="answerDefinition" label="What the amount measures" hint="e.g. Equity value of the announced acquisition" error={s.fieldErrors?.answerDefinition}>
                <TextInput id="answerDefinition" maxLength={300} defaultValue={question?.answer?.definition ?? d.answerDefinition ?? ""} error={s.fieldErrors?.answerDefinition} hint />
              </Field>
              <Field id="referenceDate" label="Reference date" optional error={s.fieldErrors?.referenceDate}>
                <TextInput id="referenceDate" type="date" defaultValue={question?.answer?.referenceDate ?? ""} error={s.fieldErrors?.referenceDate} />
              </Field>
              <Field id="referencePeriod" label="Or measurement period" optional hint="e.g. First 30 days of release" error={s.fieldErrors?.referencePeriod}>
                <TextInput id="referencePeriod" maxLength={120} defaultValue={question?.answer?.referencePeriod ?? ""} error={s.fieldErrors?.referencePeriod} hint />
              </Field>
            </div>
            <Field id="explanation" label="Explanation shown with the answer" hint="20+ characters. Plain, factual, cites the context." error={s.fieldErrors?.explanation}>
              <TextArea id="explanation" rows={3} maxLength={1200} defaultValue={question?.answer?.explanation ?? d.explanation ?? ""} error={s.fieldErrors?.explanation} />
            </Field>
          </fieldset>
        </div>
      )}
    />
  );
}
