import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";

/**
 * Optional AI drafting assistant for administrators.
 *
 * Output is UNTRUSTED DRAFT CONTENT: it is shown to the admin, who may save it as a draft
 * question. Drafts are never verified or published automatically; the human workflow (exact
 * answer, sources, verification, approval) still applies. Suggested sources are leads to
 * check, not citations — they are never stored as question sources.
 */
const SuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      prompt: z.string(),
      context: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]),
      category: z.string(),
      monetary_definition: z.string(),
      reference_period: z.string(),
      why_interesting: z.string(),
      where_to_verify: z.string(),
      ambiguity_risks: z.string(),
    }),
  ),
});

export type AiSuggestion = z.infer<typeof SuggestionSchema>["suggestions"][number];

const SYSTEM = `You help the editors of Pricele, a daily game where players guess real-world prices in US dollars.
Propose candidate questions. Each must ask for ONE precisely defined, positive USD amount (retail price, acquisition equity value, enterprise value, construction cost, auction hammer price, contract value, box-office gross, etc.) and name that definition explicitly, with the exact product/model/retailer/market and a reference date or period, so the answer is unambiguous.
Do NOT state the answer amount: editors will research and verify it from primary sources. Under where_to_verify, describe the kind of primary source to check (e.g. "the acquirer's press release", "the retailer's product page") without inventing URLs, titles or figures.
Flag anything that could make the answer ambiguous under ambiguity_risks. Avoid questions whose answer depends on unsupported estimates. Vary categories and avoid the topics the editor lists as already used.`;

export class AiNotConfiguredError extends Error {}
export class AiRefusedError extends Error {}

export async function suggestQuestions(input: {
  topic: string;
  difficulty: "easy" | "medium" | "hard" | "any";
  count: number;
  avoid: string[];
}): Promise<AiSuggestion[]> {
  const env = serverEnv();
  if (!env.aiApiKey) throw new AiNotConfiguredError();
  const client = new Anthropic({ apiKey: env.aiApiKey });

  const user = [
    `Suggest ${input.count} candidate questions.`,
    input.topic ? `Topic or theme: ${input.topic}` : "Topic: editor's choice, varied.",
    input.difficulty === "any" ? "Mix difficulties." : `Difficulty: ${input.difficulty}.`,
    input.avoid.length ? `Recently used prompts to avoid duplicating:\n- ${input.avoid.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await client.beta.messages.parse({
    model: env.aiModel,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(SuggestionSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });

  if (response.stop_reason === "refusal") throw new AiRefusedError();
  return response.parsed_output?.suggestions.slice(0, input.count) ?? [];
}
