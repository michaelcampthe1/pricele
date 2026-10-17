import { describe, expect, it } from "vitest";
import {
  computeScore,
  formatPercentageError,
  percentageError,
  ScoringInputError,
} from "@/lib/scoring";

describe("computeScore", () => {
  it("awards 1,000 for an exact guess", () => {
    expect(computeScore("25000", "25000")).toBe(1000);
    expect(computeScore("0.01", "0.01")).toBe(1000);
  });

  it("awards ~591 for a guess twice or half the answer (symmetric)", () => {
    expect(computeScore("50000", "25000")).toBe(591);
    expect(computeScore("12500", "25000")).toBe(591);
  });

  it("awards ~303 for a guess ten times or one-tenth the answer", () => {
    expect(computeScore("250000", "25000")).toBe(303);
    expect(computeScore("2500", "25000")).toBe(303);
  });

  it("is symmetric for any ratio", () => {
    for (const r of ["1.5", "3", "7.25", "100", "12345.67"]) {
      const up = computeScore((25000 * Number(r)).toFixed(2), "25000");
      const down = computeScore((25000 / Number(r)).toFixed(6), "25000");
      expect(Math.abs(up - down)).toBeLessThanOrEqual(1);
    }
  });

  it("returns integers between 0 and 1000", () => {
    const pairs: [string, string][] = [
      ["0.01", "1000000000000000"],
      ["1000000000000000", "0.01"],
      ["1", "2"],
      ["999.99", "1000"],
    ];
    for (const [g, a] of pairs) {
      const s = computeScore(g, a);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1000);
    }
    // Most extreme supported ratio: 1e17 → 1000/(1+39.14) ≈ 25
    expect(computeScore("0.01", "1000000000000000")).toBe(25);
  });

  it("handles very small and very large valid values", () => {
    expect(computeScore("0.02", "0.01")).toBe(591);
    expect(computeScore("1000000000000000", "500000000000000")).toBe(591);
  });

  it("handles decimal precision without float drift", () => {
    // 0.1 + 0.2 style inputs: exact decimals are parsed as decimals
    expect(computeScore("0.30", "0.30")).toBe(1000);
    expect(computeScore("19.99", "19.99")).toBe(1000);
    expect(computeScore("20.00", "19.99")).toBe(1000); // 1000/(1+0.0005) = 999.5 → rounds half up to 1000
    expect(computeScore("20.01", "19.99")).toBe(999);
  });

  it("rejects zero, negatives, NaN, infinity, and out-of-range values", () => {
    expect(() => computeScore("0", "10")).toThrow(ScoringInputError);
    expect(() => computeScore("10", "0")).toThrow(ScoringInputError);
    expect(() => computeScore("-5", "10")).toThrow(ScoringInputError);
    expect(() => computeScore(Number.NaN, "10")).toThrow(ScoringInputError);
    expect(() => computeScore(Number.POSITIVE_INFINITY, "10")).toThrow(ScoringInputError);
    expect(() => computeScore("abc", "10")).toThrow(ScoringInputError);
    expect(() => computeScore("1000000000000000.01", "10")).toThrow(ScoringInputError);
  });
});

describe("percentageError", () => {
  it("computes |G - A| / A * 100", () => {
    expect(percentageError("30000", "25000")).toBe("20.000000");
    expect(percentageError("20000", "25000")).toBe("20.000000");
    expect(percentageError("25000", "25000")).toBe("0.000000");
    expect(percentageError("250000", "25000")).toBe("900.000000");
    expect(percentageError("1", "3")).toBe("66.666667");
  });

  it("formats for display without changing stored precision", () => {
    expect(formatPercentageError("20.000000")).toBe("20%");
    expect(formatPercentageError("3.456")).toBe("3.5%");
    expect(formatPercentageError("0.04")).toBe("<0.1%");
    expect(formatPercentageError("0")).toBe("0%");
    expect(formatPercentageError("1250.4")).toBe("1,250%");
  });
});
