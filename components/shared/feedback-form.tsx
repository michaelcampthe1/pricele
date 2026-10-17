"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { submitFeedbackAction } from "@/lib/feedback";

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send message"}</Button>;
}

export function FeedbackForm() {
  const [state, action] = useActionState(submitFeedbackAction, {});
  if (state.ok) return <Alert tone="success" role="status">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Field id="message" label="Message" hint="Report a wrong answer, suggest a question, or ask a privacy question." error={state.fieldErrors?.message}>
        <TextArea id="message" name="message" rows={5} maxLength={2000} defaultValue={state.values?.message} error={state.fieldErrors?.message} />
      </Field>
      <Field id="contact" label="How can we reply? (optional)" hint="An email address, if you'd like a response." error={state.fieldErrors?.contact}>
        <TextInput id="contact" name="contact" maxLength={200} defaultValue={state.values?.contact} hint />
      </Field>
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Submit />
    </form>
  );
}
