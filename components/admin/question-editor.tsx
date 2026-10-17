"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { saveQuestionAction, suggestQuestionsAction, type SuggestState } from "@/lib/admin/actions";
import { formatUsd, parseUsdInput } from "@/lib/money";

export type QuestionDraft = {
  id?: string;
  prompt: string;
  context: string;
  difficulty: "easy" | "medium" | "hard";
  category_id: string;
  slug: string;
  image_url: string;
  image_alt: string;
  image_credit: string;
  answer_amount: string;
  answer_definition: string;
  reference_date: string;
  reference_period: string;
  explanation: string;
  ai_assisted: boolean;
};

export const EMPTY_DRAFT: QuestionDraft = {
  prompt: "", context: "", difficulty: "easy", category_id: "", slug: "", image_url: "", image_alt: "", image_credit: "",
  answer_amount: "", answer_definition: "", reference_date: "", reference_period: "", explanation: "", ai_assisted: false,
};

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save question"}</Button>;
}

export function QuestionEditor({ initial, categories }: { initial: QuestionDraft; categories: { id: string; name: string }[] }) {
  const [state, action] = useActionState(saveQuestionAction, {});
  const v = { ...initial, ...(state.values ?? {}) } as QuestionDraft;
  const e = state.fieldErrors ?? {};
  const [amount, setAmount] = useState(v.answer_amount);
  const parsed = amount ? parseUsdInput(amount) : null;

  return (
    <form action={action} className="space-y-5" noValidate>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="ai_assisted" value={String(v.ai_assisted)} />
      {state.message ? <Alert tone={state.ok ? "success" : "error"} role="status">{state.message}</Alert> : null}
      {v.ai_assisted ? (
        <Alert tone="warning">AI-assisted draft. Research and verify every detail yourself; nothing here is a confirmed fact.</Alert>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Player-facing</legend>
        <Field id="prompt" label="Question" hint="Ask for exactly one monetary amount and name its definition." error={e.prompt}>
          <TextArea id="prompt" name="prompt" rows={2} maxLength={300} defaultValue={v.prompt} error={e.prompt} />
        </Field>
        <Field id="context" label="Context (optional)" hint="Reference date, retailer, version, etc." error={e.context}>
          <TextArea id="context" name="context" rows={2} maxLength={600} defaultValue={v.context} error={e.context} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="difficulty" label="Difficulty">
            <Select id="difficulty" name="difficulty" defaultValue={v.difficulty}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
          <Field id="category_id" label="Category" error={e.category_id}>
            <Select id="category_id" name="category_id" defaultValue={v.category_id}>
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field id="slug" label="Slug (optional)" error={e.slug}>
            <TextInput id="slug" name="slug" defaultValue={v.slug} error={e.slug} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="image_url" label="Image URL (optional, licensed)" error={e.image_url}>
            <TextInput id="image_url" name="image_url" type="url" defaultValue={v.image_url} error={e.image_url} />
          </Field>
          <Field id="image_alt" label="Image alt text" error={e.image_alt}>
            <TextInput id="image_alt" name="image_alt" defaultValue={v.image_alt} error={e.image_alt} />
          </Field>
          <Field id="image_credit" label="Image credit">
            <TextInput id="image_credit" name="image_credit" defaultValue={v.image_credit} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-[var(--radius)] border border-warning/25 bg-warning-soft/30 p-4">
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-warning">Answer key (confidential)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="answer_amount" label="Target amount (USD)" hint={parsed?.ok ? formatUsd(parsed.value) : "Exact positive amount, up to 2 decimals."} error={e.answer_amount}>
            <TextInput id="answer_amount" name="answer_amount" inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value)} error={e.answer_amount} hint />
          </Field>
          <Field id="answer_definition" label="Exact definition" hint='e.g. "Equity value of the announced deal".' error={e.answer_definition}>
            <TextInput id="answer_definition" name="answer_definition" maxLength={300} defaultValue={v.answer_definition} error={e.answer_definition} hint />
          </Field>
          <Field id="reference_date" label="Reference date" error={e.reference_date}>
            <TextInput id="reference_date" name="reference_date" type="date" defaultValue={v.reference_date} error={e.reference_date} />
          </Field>
          <Field id="reference_period" label="…or reference period" hint='e.g. "Worldwide theatrical run, 2019–2020".'>
            <TextInput id="reference_period" name="reference_period" maxLength={120} defaultValue={v.reference_period} hint />
          </Field>
        </div>
        <Field id="explanation" label="Explanation shown after the reveal" error={e.explanation}>
          <TextArea id="explanation" name="explanation" rows={3} maxLength={1200} defaultValue={v.explanation} error={e.explanation} />
        </Field>
      </fieldset>
      <Submit />
    </form>
  );
}

function SuggestSubmit() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="secondary" size="sm" disabled={pending}><Sparkles aria-hidden className="size-4" />{pending ? "Thinking…" : "Suggest ideas"}</Button>;
}

export function NewQuestion({ categories, aiEnabled }: { categories: { id: string; name: string }[]; aiEnabled: boolean }) {
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_DRAFT);
  const [version, setVersion] = useState(0);
  const [state, action] = useActionState<SuggestState, FormData>(suggestQuestionsAction, {});

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <QuestionEditor key={version} initial={draft} categories={categories} />
      <aside className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles aria-hidden className="size-4 text-accent" /> AI-assisted ideas</h2>
        {!aiEnabled ? (
          <p className="text-sm text-muted">Not configured. Set <code>AI_PROVIDER_API_KEY</code> to enable optional drafting help. The manual workflow is fully functional without it.</p>
        ) : (
          <>
            <p className="text-sm text-muted">Suggestions are untrusted drafts without answers. You research and verify everything.</p>
            <form action={action} className="space-y-2">
              <TextInput id="ai-topic" name="topic" placeholder="Topic (optional)" aria-label="Topic" />
              <div className="flex gap-2">
                <Select id="ai-difficulty" name="difficulty" aria-label="Difficulty" defaultValue="any">
                  <option value="any">Any difficulty</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
                <input type="hidden" name="count" value="3" />
              </div>
              <SuggestSubmit />
            </form>
            {state.message && !state.ok ? <Alert tone="error">{state.message}</Alert> : null}
            <ul className="space-y-3">
              {(state.suggestions ?? []).map((s, i) => (
                <li key={i} className="space-y-1.5 rounded-[var(--radius)] border border-border bg-surface p-3 text-sm">
                  <p className="font-medium">{s.prompt}</p>
                  <p className="text-xs text-muted">{s.difficulty} · {s.category} · {s.monetary_definition}</p>
                  <p className="text-xs text-ink-soft"><span className="font-medium">Verify via:</span> {s.where_to_verify}</p>
                  <p className="text-xs text-warning"><span className="font-medium">Ambiguity risks:</span> {s.ambiguity_risks}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const cat = categories.find((c) => c.name.toLowerCase() === s.category.toLowerCase());
                      setDraft({ ...EMPTY_DRAFT, prompt: s.prompt, context: s.context, difficulty: s.difficulty, category_id: cat?.id ?? "", answer_definition: s.monetary_definition, reference_period: s.reference_period, ai_assisted: true });
                      setVersion((n) => n + 1);
                    }}
                  >
                    Use as draft
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
