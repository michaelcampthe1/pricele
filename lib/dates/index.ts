/**
 * Game calendar utilities. Every daily boundary uses the IANA zone America/New_York, so
 * daylight-saving transitions are handled by the platform's time-zone database rather than
 * fixed UTC offsets. Game dates are plain "YYYY-MM-DD" strings.
 */
export const GAME_TIME_ZONE = "America/New_York";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(instant: Date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** The Eastern Time game date for an instant (defaults to now, server clock). */
export function getGameDate(instant: Date = new Date()): string {
  return zonedParts(instant).date;
}

export function isValidGameDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3]) &&
    Number(m[1]) >= 2000 &&
    Number(m[1]) <= 2200
  );
}

function toUtcDate(date: string): Date {
  if (!isValidGameDate(date)) throw new RangeError(`Invalid game date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

/** Monday that starts the Eastern Time week containing `date`. */
export function weekStart(date: string): string {
  const dow = toUtcDate(date).getUTCDay(); // 0 = Sunday
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(date, offset);
}

/**
 * The UTC instant at which the given game date begins (00:00 America/New_York).
 * Midnight ET is always 04:00 or 05:00 UTC, so we test both candidates.
 */
export function gameDateStartsAt(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  for (const hour of [4, 5]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, hour));
    const z = zonedParts(candidate);
    if (z.date === date && z.hour === 0 && z.minute === 0) return candidate;
  }
  throw new RangeError(`Could not resolve midnight for ${date}`);
}

/** Instant of the next daily reset after `now`. */
export function nextResetAt(now: Date = new Date()): Date {
  return gameDateStartsAt(addDays(getGameDate(now), 1));
}

export function formatGameDate(
  date: string,
  style: "long" | "medium" | "short" = "long",
): string {
  const options: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : style === "medium"
        ? { month: "long", day: "numeric", year: "numeric" }
        : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(toUtcDate(date));
}
