import "server-only";
import { headers } from "next/headers";

type Level = "info" | "warn" | "error";

const REDACT = /(token|password|secret|authorization|cookie|key)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        REDACT.test(k) ? "[redacted]" : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}

async function requestId(): Promise<string | undefined> {
  try {
    return (await headers()).get("x-request-id") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Structured server log line (JSON). Secrets are redacted by key name. This is the single
 * integration point for an external monitoring service: forward from here.
 */
export async function log(level: Level, event: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    event,
    requestId: await requestId(),
    time: new Date().toISOString(),
    ...(redact(data) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
