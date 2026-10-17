"use client";

import { useEffect, useState } from "react";
import { msUntilNextReset } from "@/lib/dates";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m ${(s % 60).toString().padStart(2, "0")}s`;
}

/** Time until midnight America/New_York. Display only — the server decides what "today" is. */
export function ResetCountdown({ prefix = "Next game in" }: { prefix?: string }) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setMs(msUntilNextReset());
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tnum" suppressHydrationWarning>
      {prefix} {ms === null ? "—" : fmt(ms)}
    </span>
  );
}
