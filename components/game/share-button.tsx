"use client";

import { useState } from "react";
import { Share2, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shares a spoiler-free summary via the Web Share API, falling back to the clipboard. */
export function ShareButton({ text, url }: { text: string; url?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "shared" | "failed">("idle");

  async function share() {
    const payload = url ? `${text}` : text;
    try {
      if (typeof navigator !== "undefined" && navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text: payload });
        setStatus("shared");
        return;
      }
      await navigator.clipboard.writeText(payload);
      setStatus("copied");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // user closed the share sheet
      try {
        await navigator.clipboard.writeText(payload);
        setStatus("copied");
      } catch {
        setStatus("failed");
      }
    }
    setTimeout(() => setStatus("idle"), 3000);
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button size="lg" onClick={share} className="w-full">
        {status === "copied" ? <Check aria-hidden className="h-4 w-4" /> : <Share2 aria-hidden className="h-4 w-4" />}
        {status === "copied" ? "Copied to clipboard" : status === "shared" ? "Shared" : "Share results"}
      </Button>
      <p role="status" className="min-h-5 text-center text-sm text-muted">
        {status === "failed" && (
          <span className="text-red">
            Couldn&apos;t copy automatically. Select the text below to copy it.
          </span>
        )}
      </p>
      {status === "failed" && (
        <pre className="whitespace-pre-wrap rounded-[10px] border border-line bg-sunk p-3 text-sm">
          <Copy aria-hidden className="mb-1 h-4 w-4" />
          {text}
        </pre>
      )}
    </div>
  );
}
