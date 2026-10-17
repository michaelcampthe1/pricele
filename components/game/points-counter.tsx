"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/money";

/** Counts up to `value` once; instant when the user prefers reduced motion. */
export function PointsCounter({ value, durationMs = 750 }: { value: number; durationMs?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      const t = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(t);
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);
  return <span className="tabular">{formatPoints(shown)}</span>;
}
