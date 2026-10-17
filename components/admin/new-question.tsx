"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { QuestionForm, type QuestionDraft } from "@/components/admin/question-form";
import { aiSuggestAction } from "@/app/admin/actions";
import type { Suggestion } from "@/lib/ai/suggest";
import { Alert, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/form";

export function NewQuestion({ categories, aiEnabled }: { categories: { id: string; name: string }[]; aiEnabled: boolean }) {
  const [draft, setDraft] = useState<QuestionDraft | undefined>();
  const [draftKey, setDraftKey] = useState(0);
  const [topic, setTopic] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function use(s: Suggestion) {
    const cat = categories.find((c) => c.name.toLowerCase() === s.category.toLowerCase());
    setDraft({
      prompt: s.prompt,
      context: s.context ?? null,
      difficulty: s.difficulty,
      categoryId: cat?.id,
      answerDefinition: s.answerDefinition,
      explanation: s.explanation,
    });
    setDraftKey((k) => k + 1);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <QuestionForm key={draftKey} categories={categories} draft={draft} />
      </section>
      <aside className="space-y-4 rounded-[14px] border border-line bg-surface p-5">
        <h2 className="inline-flex items-center gap-2 font-semibold">
          <Sparkles aria-hidden className="h-4 w-4 text-green" /> AI drafting assistant
        </h2>
        {!aiEnabled ? (
          <p className="text-sm text-muted">
            Not configured. Set <code>AI_PROVIDER_API_KEY</code> to get topic ideas and wording drafts. Manual creation works fully without it.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Suggestions are unverified drafts. They never include an answer: you enter the amount from a source you checked.
            </p>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                start(async () => {
                  const r = await aiSuggestAction(topic);
                  if (r.ok) setSuggestions(r.suggestions);
                  else setError(r.error);
                });
              }}
            >
              <label htmlFor="topic" className="text-sm font-medium">Topic or idea</label>
              <TextInput id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. stadium construction costs" />
              <Button type="submit" variant="secondary" disabled={pending || topic.trim().length < 3}>
                {pending && <Spinner />} Suggest drafts
              </Button>
            </form>
            {error && <Alert tone="error">{error}</Alert>}
            <ul className="space-y-3">
              {suggestions.map((s, i) => (
                <li key={i} className="rounded-[10px] border border-line p-3 text-sm">
                  <p className="font-medium">{s.prompt}</p>
                  <p className="mt-1 text-muted">
                    {s.difficulty}, {s.category}. Measures: {s.answerDefinition}
                  </p>
                  {s.sourceCandidates.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                      {s.sourceCandidates.map((c) => (
                        <li key={c.url}>Check: {c.title} ({c.url})</li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => use(s)} className="mt-2 text-sm font-semibold text-green-strong underline">
                    Use as draft
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
