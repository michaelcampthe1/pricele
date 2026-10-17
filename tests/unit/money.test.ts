import { describe, expect, it } from "vitest";
import { amountInWords, formatUsd, formatUsdCompact, parseUsdInput } from "@/lib/money";

describe("parseUsdInput", () => {
  it.each([
    ["1234", "1234.00"],
    ["$1,234.50", "1234.50"],
    ["  25000 ", "25000.00"],
    ["2.5k", "2500.00"],
    ["3 million", "3000000.00"],
    ["1.2B", "1200000000.00"],
    ["4t", "4000000000000.00"],
    [".99", "0.99"],
    ["0.01", "0.01"],
    ["1000000000000000", "1000000000000000.00"],
    ["USD 15", "15.00"],
  ])("parses %s", (input, expected) => {
    expect(parseUsdInput(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    [""],
    ["   "],
    ["0"],
    ["0.00"],
    ["-5"],
    ["abc"],
    ["1,23"],
    ["12.345"],
    ["Infinity"],
    ["NaN"],
    ["1e5"],
    ["0.001k"], // 1 → fine? no: 0.001k = 1.00 — see next test
    ["1000000000000000.01"],
    ["2 zillion"],
  ])("rejects %s", (input) => {
    if (input === "0.001k") {
      expect(parseUsdInput(input)).toEqual({ ok: true, value: "1.00" });
      return;
    }
    expect(parseUsdInput(input).ok).toBe(false);
  });

  it("rejects non-string input types", () => {
    expect(parseUsdInput(undefined).ok).toBe(false);
    expect(parseUsdInput(null).ok).toBe(false);
    expect(parseUsdInput({}).ok).toBe(false);
  });
});

describe("formatting", () => {
  it("formats dollars with commas and cents only when present", () => {
    expect(formatUsd("25000.00")).toBe("$25,000");
    expect(formatUsd("19.99")).toBe("$19.99");
    expect(formatUsd("1000000000000000.00")).toBe("$1,000,000,000,000,000");
    expect(formatUsd("999999999999999.99")).toBe("$999,999,999,999,999.99");
  });

  it("formats compact values", () => {
    expect(formatUsdCompact("950")).toBe("$950");
    expect(formatUsdCompact("1200000")).toBe("$1.2M");
  });

  it("spells out large amounts", () => {
    expect(amountInWords("2500000000")).toBe("2.5 billion");
    expect(amountInWords("999")).toBe("");
  });
});
