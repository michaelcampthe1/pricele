import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatGameDate, gameDateStartsAt, getGameDate, isValidGameDate, nextResetAt, weekStart } from "@/lib/dates";

describe("Eastern Time game dates", () => {
  it("uses the America/New_York calendar, not UTC", () => {
    // 03:30 UTC on Oct 17 is 23:30 EDT on Oct 16.
    expect(getGameDate(new Date("2026-10-17T03:30:00Z"))).toBe("2026-10-16");
    expect(getGameDate(new Date("2026-10-17T04:00:00Z"))).toBe("2026-10-17");
    // Winter (EST, UTC−5): midnight is 05:00 UTC.
    expect(getGameDate(new Date("2026-01-15T04:59:59Z"))).toBe("2026-01-14");
    expect(getGameDate(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
  });

  it("handles daylight-saving transitions", () => {
    // DST starts 2026-03-08 (02:00 EST → 03:00 EDT); ends 2026-11-01.
    expect(gameDateStartsAt("2026-03-08").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(gameDateStartsAt("2026-03-09").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(gameDateStartsAt("2026-11-01").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(gameDateStartsAt("2026-11-02").toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(getGameDate(new Date("2026-03-08T06:30:00Z"))).toBe("2026-03-08");
    expect(getGameDate(new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01");
  });

  it("computes the next reset", () => {
    expect(nextResetAt(new Date("2026-10-16T20:00:00Z")).toISOString()).toBe("2026-10-17T04:00:00.000Z");
    expect(nextResetAt(new Date("2026-03-07T12:00:00Z")).toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("does date arithmetic on calendar days", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("finds the Monday that starts each week", () => {
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // Monday
    expect(weekStart("2026-10-16")).toBe("2026-10-12"); // Friday
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday belongs to the previous Monday
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });

  it("validates date strings strictly", () => {
    expect(isValidGameDate("2026-10-16")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "26-10-16", "2026-10-16T00:00", "", null, 20261016, "1999-12-31"]) {
      expect(isValidGameDate(bad), String(bad)).toBe(false);
    }
  });

  it("formats dates without shifting them across time zones", () => {
    expect(formatGameDate("2026-10-16")).toBe("Friday, October 16, 2026");
    expect(formatGameDate("2026-10-16", "short")).toBe("Oct 16");
  });
});
