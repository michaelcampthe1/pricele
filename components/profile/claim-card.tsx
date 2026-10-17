"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { claimGuestProgress } from "@/lib/auth/claim";

export function ClaimCard({ attempts, days }: { attempts: number; days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "error"; text: string } | null>(null);

  function claim() {
    start(async () => {
      const res = await claimGuestProgress();
      if (!res.ok) {
        setMessage({ tone: "error", text: res.message });
        return;
      }
      // Navigate with the outcome so the confirmation survives the page re-render.
      router.replace(`${pathname}?claimed=${res.claimedSets}&skipped=${res.skippedSets}`);
    });
  }

  if (message) return <Alert tone={message.tone} role="status">{message.text}</Alert>;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-accent/25 bg-accent-soft/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-ink">Save your guest progress</p>
        <p className="text-sm text-ink-soft">
          You played {attempts} {attempts === 1 ? "question" : "questions"} across {days} {days === 1 ? "day" : "days"} before signing in on this device.
        </p>
      </div>
      <Button onClick={claim} disabled={pending}>
        <Save aria-hidden className="size-4" /> {pending ? "Saving…" : "Save to my account"}
      </Button>
    </div>
  );
}
