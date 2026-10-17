/**
 * Minimal structured logger. Writes JSON lines to stdout/stderr, which Vercel and most
 * hosts collect. Hook an error-monitoring service in `reportError` (see README).
 * Never pass tokens, passwords, cookies or guest secrets in `data`.
 */
type Level = "info" | "warn" | "error";

const REDACT = /(token|password|secret|cookie|authorization|hash)/i;

function scrub(data: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = REDACT.test(k) ? "[redacted]" : v;
  return out;
}

function write(level: Level, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...scrub(data) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => {
    write("error", event, data);
    reportError(event, data);
  },
};

/** Integration point for Sentry/Datadog/etc. Intentionally a no-op until configured. */
function reportError(event: string, data?: Record<string, unknown>) {
  void event;
  void data;
}
