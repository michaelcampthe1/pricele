"use client";

import { useEffect, useState } from "react";

const COLORS = ["#1d7348", "#f4d35e", "#e3a33a", "#d9577f", "#3d7fd9", "#5fae6a"];
const PIECES = 46;

type Piece = { left: number; delay: number; duration: number; drift: number; spin: number; color: string; w: number; h: number; round: boolean };

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.25,
    duration: 1.6 + Math.random() * 1.1,
    drift: (Math.random() - 0.5) * 160,
    spin: (Math.random() - 0.5) * 1080,
    color: COLORS[i % COLORS.length],
    w: 7 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    round: i % 5 === 0,
  }));
}

/**
 * One-shot confetti burst over the whole screen. Purely decorative: hidden from screen
 * readers, ignores clicks, skipped entirely for people who prefer reduced motion.
 */
export function Confetti() {
  const [pieces] = useState<Piece[] | null>(() => {
    if (typeof window === "undefined") return null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
    return makePieces();
  });
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!pieces) return;
    try {
      navigator.vibrate?.([40, 60, 40]);
    } catch {
      // Vibration isn't available everywhere; that's fine.
    }
    const t = setTimeout(() => setDone(true), 3200);
    return () => clearTimeout(t);
  }, [pieces]);

  if (!pieces || done) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              width: p.w,
              height: p.round ? p.w : p.h,
              background: p.color,
              borderRadius: p.round ? 999 : 2,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
