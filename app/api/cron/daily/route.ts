import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";

/**
 * Daily maintenance, invoked by a scheduler (e.g. Vercel Cron) shortly after midnight ET.
 * Authenticated with `Authorization: Bearer <CRON_SECRET>`. It:
 *   * marks scheduled sets whose date arrived as published (visibility never depends on this:
 *     scheduled sets are already date-gated, so the game is live even if the job is late);
 *   * deletes expired unclaimed guest sessions and old rate-limit rows;
 *   * reports the next 7 days' publication coverage and logs a warning for gaps.
 * Never creates or reuses questions.
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv().cronSecret;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await createServiceClient().rpc("run_daily_maintenance");
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "cron.daily_failed", message: error.message }));
    return NextResponse.json({ error: "maintenance_failed" }, { status: 500 });
  }
  const report = data as { upcoming: { game_date: string; status: string | null }[]; promoted_sets: number };
  const gaps = report.upcoming.filter((d) => d.status !== "published" && d.status !== "scheduled").map((d) => d.game_date);
  console.info(JSON.stringify({ level: gaps.length ? "warn" : "info", event: "cron.daily", promoted: report.promoted_sets, gaps }));
  return NextResponse.json({ ok: true, ...report, unpublished_upcoming_dates: gaps });
}
