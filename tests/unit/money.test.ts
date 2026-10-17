import { describe, expect, it } from "vitest";
import { absoluteDifference, formatPercent, formatUsd, formatUsdCompact, parseUsdInput } from "@/lib/money";

describe("parseUsdInput", () => {
  it.each([
    ["25000", "25000.00"],
    ["$25,000", "25000.00"],
    ["25,000.5", "25000.50"],
    ["  $1,234,567.89 ", "1234567.89"],
    [".99", "0.99"],
    ["2.5m", "2500000.00"],
    ["2.5M", "2500000.00"],
    ["3b", "3000000000.00"],
    ["3 billion", "3000000000.00"],
    ["40k", "40000.00"],
    ["1.25 tn", "1250000000000.00"],
    ["1 thousand", "1000.00"],
    ["USD 15", "15.00"],
    ["0.005", "0.01"],
    ["1.234", "1.23"],
    ["1000000000000000", "1000000000000000.00"],
  ])("parses %s", (input, expected) => {
    expect(parseUsdInput(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["0", "too_small"],
    ["0.004", "too_small"],
    ["-5", "invalid"],
    ["abc", "invalid"],
    ["1e6", "invalid"],
    ["NaN", "invalid"],
    ["Infinity", "invalid"],
    ["1,00", "invalid"],
    ["12,34,567", "invalid"],
    ["1.2.3", "invalid"],
    ["1000000000000000.01", "too_large"],
    ["2000t", "too_large"],
  ])("rejects %j as %s", (input, error) => {
    expect(parseUsdInput(input)).toEqual({ ok: false, error });
  });
});

describe("formatting", () => {
  it("formats USD with cents only when present", () => {
    expect(formatUsd("25000.00")).toBe("$25,000");
    expect(formatUsd("1299.99")).toBe("$1,299.99");
    expect(formatUsd("0.5")).toBe("$0.50");
    expect(formatUsd("999999999999999.99")).toBe("$999,999,999,999,999.99");
  });
  it("compacts large amounts as a readability hint", () => {
    expect(formatUsdCompact("2500000")).toBe("$2.5 million");
    expect(formatUsdCompact("44000000000")).toBe("$44 billion");
    expect(formatUsdCompact("1250000000000")).toBe("$1.25 trillion");
    expect(formatUsdCompact("999")).toBe("$999");
  });
  it("computes exact differences", () => {
    expect(absoluteDifference("0.3", "0.1")).toBe("0.20");
    expect(absoluteDifference("25000", "30000")).toBe("5000.00");
  });
  it("rounds percentages for presentation only", () => {
    expect(formatPercent("20.000000")).toBe("20%");
    expect(formatPercent("42.857143")).toBe("42.9%");
    expect(formatPercent("3.141593")).toBe("3.14%");
    expect(formatPercent("123456.7")).toBe("123,457%");
  });
});
