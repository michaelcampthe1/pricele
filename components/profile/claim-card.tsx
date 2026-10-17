"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { claimGuestProgress } from "@/lib/auth/claim";

export function ClaimCard({ attempts, days }: { attempts: number; days: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  function claim() {
    start(async () => {
      const res = await claimGuestProgress();
      if (!res.ok) {
        setMessage({ tone: "error", text: res.message });
        return;
      }
      setMessage(
        res.claimedSets > 0
          ? {
              tone: "success",
              text: `Saved ${res.claimedSets} ${res.claimedSets === 1 ? "day" : "days"} of guest progress to your account.${res.skippedSets ? ` ${res.skippedSets} skipped because you'd already played those days on this account.` : ""}`,
            }
          : { tone: "info", text: "Nothing new to save — you'd already played those days on this account, so your account results stand." },
      );
      router.refresh();
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
