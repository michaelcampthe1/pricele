"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareButton({ text, url }: { text: string; url: string }) {
  const [status, setStatus] = useState<string>("");

  async function share() {
    setStatus("");
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ text });
        setStatus("Shared.");
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied your results to the clipboard.");
    } catch {
      setStatus(`Couldn't copy automatically. Share this link: ${url}`);
    }
  }

  return (
    <div className="space-y-2">
      <Button size="lg" onClick={share} className="w-full sm:w-auto">
        <Share2 aria-hidden className="size-4" /> Share results
      </Button>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-accent-strong">
        {status}
      </p>
    </div>
  );
}
