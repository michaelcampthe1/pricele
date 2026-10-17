import { describe, expect, it } from "vitest";
import {
  addDays,
  gameDateFor,
  gameDayStartUtc,
  isGameDateString,
  msUntilNextReset,
  weekRange,
  weekStart,
} from "@/lib/dates";

describe("game dates (America/New_York)", () => {
  it("uses Eastern Time, not UTC, for the calendar date", () => {
    // 2026-10-17 03:30 UTC is still Oct 16 in New York (EDT, UTC-4)
    expect(gameDateFor(new Date("2026-10-17T03:30:00Z"))).toBe("2026-10-16");
    expect(gameDateFor(new Date("2026-10-17T04:00:00Z"))).toBe("2026-10-17");
    // Winter (EST, UTC-5)
    expect(gameDateFor(new Date("2026-01-15T04:59:59Z"))).toBe("2026-01-14");
    expect(gameDateFor(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
  });

  it("resolves midnight correctly on both sides of DST transitions", () => {
    expect(gameDayStartUtc("2026-03-08").toISOString()).toBe("2026-03-08T05:00:00.000Z"); // DST starts later that day
    expect(gameDayStartUtc("2026-03-09").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(gameDayStartUtc("2026-11-01").toISOString()).toBe("2026-11-01T04:00:00.000Z"); // DST ends later that day
    expect(gameDayStartUtc("2026-11-02").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("computes the time to the next reset", () => {
    expect(msUntilNextReset(new Date("2026-10-17T03:00:00Z"))).toBe(60 * 60 * 1000);
    // Day of DST end is 25 hours long
    expect(msUntilNextReset(new Date("2026-11-01T04:00:00Z"))).toBe(25 * 60 * 60 * 1000);
  });

  it("validates date strings", () => {
    expect(isGameDateString("2026-10-16")).toBe(true);
    expect(isGameDateString("2026-02-30")).toBe(false);
    expect(isGameDateString("2026-1-5")).toBe(false);
    expect(isGameDateString("../etc")).toBe(false);
    expect(isGameDateString(20261016)).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("uses Monday-to-Monday weeks", () => {
    expect(weekStart("2026-10-16")).toBe("2026-10-12"); // Friday → Monday
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // Monday
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday belongs to the prior Monday
    expect(weekRange("2026-10-19")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });
});
