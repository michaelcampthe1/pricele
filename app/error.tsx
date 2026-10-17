"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("client_error_boundary", error.digest ?? "");
  }, [error]);
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">This page hit an unexpected error. Your saved guesses and scores are safe.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">Home</ButtonLink>
      </div>
    </div>
  );
}
