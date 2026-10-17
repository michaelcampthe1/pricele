import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cronPublicationCheck } from "@/lib/admin/service";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Scheduled job (Vercel Cron: see vercel.json). Promotes scheduled sets whose date has
 * arrived and reports upcoming gaps in the logs. Requires `Authorization: Bearer $CRON_SECRET`.
 * Gameplay never depends on this job: live sets are determined by date on every read.
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const ok =
    Boolean(secret) && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await cronPublicationCheck();
    if (!result.todayLive) logger.error("cron.today_missing", { today: result.today });
    else if (result.missingNext7.length) logger.warn("cron.upcoming_gaps", { missing: result.missingNext7 });
    else logger.info("cron.ok", { promoted: result.promoted });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("cron.failed", { error: String(err) });
    return NextResponse.json({ error: "temporary_failure" }, { status: 503 });
  }
}
