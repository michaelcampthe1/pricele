"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { claimAction, dismissClaimAction } from "@/app/claim/actions";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/misc";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <Spinner />} Save to my account
    </Button>
  );
}

export function ClaimForm({ next }: { next: string }) {
  const [state, action] = useActionState(claimAction, {});
  return (
    <div className="space-y-3">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <form action={action}>
        <input type="hidden" name="next" value={next} />
        <SaveButton />
      </form>
      <form action={dismissClaimAction}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="ghost" className="w-full">
          Not now
        </Button>
      </form>
    </div>
  );
}
