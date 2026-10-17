/**
 * Game-calendar helpers. Every daily boundary uses the IANA zone America/New_York,
 * so daylight-saving transitions are handled by the platform's tz database.
 * Game dates are plain "YYYY-MM-DD" strings; timestamps are stored in UTC.
 * The database (pricele.current_game_date) is authoritative for "today"; these helpers
 * keep presentation and URL handling consistent with it.
 */

export const GAME_TIME_ZONE = "America/New_York";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isGameDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2020 && y <= 2200;
}

/** The America/New_York calendar date for an instant. */
export function gameDateFor(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GAME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtcDate(gameDate: string): Date {
  const [y, m, d] = gameDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function addDays(gameDate: string, days: number): string {
  const dt = toUtcDate(gameDate);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtcDate(dt);
}

/** Monday of the game week containing the date (weeks run Monday 12:00 AM to Monday 12:00 AM ET). */
export function weekStart(gameDate: string): string {
  const dt = toUtcDate(gameDate);
  const dow = dt.getUTCDay(); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(gameDate, diff);
}

export function weekRange(gameDate: string): { from: string; to: string } {
  const from = weekStart(gameDate);
  return { from, to: addDays(from, 6) };
}

/** UTC instant of 12:00 AM America/New_York at the start of a game date. */
export function gameDayStartUtc(gameDate: string): Date {
  const [y, m, d] = gameDate.split("-").map(Number);
  // Try both possible offsets (EST -5, EDT -4) and keep the one that maps back to midnight ET.
  for (const offset of [4, 5]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, offset, 0, 0));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: GAME_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(candidate);
    const hour = parts.find((p) => p.type === "hour")?.value;
    if (hour === "00" && gameDateFor(candidate) === gameDate) return candidate;
  }
  throw new Error(`Could not resolve midnight for ${gameDate}`);
}

/** Milliseconds until the next daily reset (midnight America/New_York). */
export function msUntilNextReset(now: Date = new Date()): number {
  const tomorrow = addDays(gameDateFor(now), 1);
  return gameDayStartUtc(tomorrow).getTime() - now.getTime();
}

export function formatGameDate(gameDate: string, style: "long" | "short" | "weekday" = "long"): string {
  const dt = toUtcDate(gameDate);
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
      : style === "weekday"
        ? { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }
        : { month: "long", day: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-US", opts).format(dt);
}

export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: GAME_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}
