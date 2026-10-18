"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** One responsive AdSense display unit. The loader script is shared and loaded once. */
export function AdUnit({ client, slot }: { client: string; slot: string }) {
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.getAttribute("data-adsbygoogle-status")) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Blocked by an ad blocker or already filled; the reserved space simply stays empty.
    }
  }, []);
  return (
    <>
      <Script
        id="adsbygoogle-loader"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        strategy="afterInteractive"
        crossOrigin="anonymous"
      />
      <ins
        ref={ref}
        className="adsbygoogle block w-full"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </>
  );
}
