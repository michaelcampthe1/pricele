"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RetryButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? "Retrying…" : label}
    </Button>
  );
}
