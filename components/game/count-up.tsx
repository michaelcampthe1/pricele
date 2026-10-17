"use client";

import { useEffect, useState } from "react";

/** Animates a number from 0 to `value` once. Instant when reduced motion is preferred. Decorative only. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span aria-hidden className="tnum">
      {shown.toLocaleString("en-US")}
    </span>
  );
}
