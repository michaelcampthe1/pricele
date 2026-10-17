import { describe, expect, it } from "vitest";
import { absolutePercentageError, scoreGuess } from "@/lib/scoring";
import { sql } from "../support/db";

function randomAmount() {
  const exp = Math.floor(Math.random() * 15) - 2; // 0.01 .. 1e13
  const cents = Math.max(1, Math.round(Math.random() * 10 ** (exp + 2) * 9) + 1);
  const s = (BigInt(cents) / BigInt(100)).toString() + "." + (BigInt(cents) % BigInt(100)).toString().padStart(2, "0");
  return s;
}

describe("scoring parity: lib/scoring (reference) vs public.pricele_score (authoritative)", () => {
  it("agrees on 2,000 random guess/answer pairs, including near-rounding boundaries", async () => {
    const pairs: [string, string][] = Array.from({ length: 1950 }, () => [randomAmount(), randomAmount()]);
    // Adversarial pairs near round-half boundaries.
    for (let i = 0; i < 50; i++) pairs.push([(100 + i * 0.01).toFixed(2), "100.00"]);
    const rows = await sql<{ g: string; a: string; s: number; e: string }>(
      `select g, a, public.pricele_score(g::numeric, a::numeric) as s, public.pricele_percentage_error(g::numeric, a::numeric)::text as e
       from unnest($1::text[], $2::text[]) as t(g, a)`,
      [pairs.map((p) => p[0]), pairs.map((p) => p[1])],
    );
    const mismatches = rows.filter((r) => r.s !== scoreGuess(r.g, r.a) || r.e !== absolutePercentageError(r.g, r.a));
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});
