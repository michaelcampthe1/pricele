import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

/** Liveness + database connectivity check for uptime monitors. Returns no data. */
export async function GET() {
  try {
    await sql()`select pricele.current_game_date()`;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
