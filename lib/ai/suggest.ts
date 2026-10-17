import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Optional AI drafting assistant (Anthropic Messages API). Output is UNTRUSTED draft text:
 * it can only pre-fill the "new question" form. It never writes to the database, never sets
 * an answer, and never verifies, approves or publishes anything.
 */

export const suggestionSchema = z.object({
  prompt: z.string().min(10).max(300),
  context: z.string().max(600).nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  category: z.string().max(60),
  answerDefinition: z.string().max(300),
  explanation: z.string().max(1200).optional().default(""),
  sourceCandidates: z
    .array(z.object({ title: z.string().max(300), url: z.string().max(1000) }))
    .max(5)
    .optional()
    .default([]),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

export function aiConfigured(): boolean {
  try {
    return Boolean(serverEnv().AI_PROVIDER_API_KEY);
  } catch {
    return false;
  }
}

const SYSTEM = `You help editors of Pricele, a daily game where players guess real-world prices in USD.
Suggest question drafts. Each must ask for ONE unambiguous positive USD amount and state exactly what it measures
(e.g. equity value vs enterprise value, list price at a named retailer on a date, construction cost, auction price incl. premium).
Do not state the answer amount. Suggest likely primary-source candidates (official announcements, filings, government records,
retailer listings, auction results); editors will check every one. Reply with JSON only: {"suggestions": [ ... ]} where each item has
prompt, context, difficulty (easy|medium|hard), category, answerDefinition, explanation, sourceCandidates [{title,url}].`;

export async function suggestQuestions(topic: string, count = 3): Promise<{ ok: true; suggestions: Suggestion[] } | { ok: false; error: string }> {
  const env = serverEnv();
  if (!env.AI_PROVIDER_API_KEY) return { ok: false, error: "AI assistance isn't configured (AI_PROVIDER_API_KEY)." };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.AI_PROVIDER_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: `Topic or idea: ${topic.slice(0, 500)}\nGive ${count} varied suggestions.` }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      logger.warn("ai.request_failed", { status: res.status });
      return { ok: false, error: `The AI provider returned an error (${res.status}).` };
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const parsed = z.object({ suggestions: z.array(suggestionSchema).max(6) }).safeParse(json);
    if (!parsed.success) return { ok: false, error: "The AI response wasn't in the expected format. Try again." };
    return { ok: true, suggestions: parsed.data.suggestions };
  } catch (err) {
    logger.warn("ai.failed", { error: String(err) });
    return { ok: false, error: "AI suggestions are unavailable right now." };
  }
}
