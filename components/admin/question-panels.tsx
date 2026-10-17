"use client";

import { ActionForm } from "@/components/admin/action-form";
import { addSourceAction, correctAnswerAction, questionStatusAction, verifyAnswerAction } from "@/app/admin/actions";
import { Field, TextArea, TextInput } from "@/components/ui/form";

export function SourceForm({ questionId }: { questionId: string }) {
  return (
    <ActionForm
      action={addSourceAction}
      submitLabel="Add source"
      variant="secondary"
      hidden={{ questionId }}
      render={(s) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="title" label="Title" error={s.fieldErrors?.title}>
            <TextInput id="title" maxLength={300} error={s.fieldErrors?.title} />
          </Field>
          <Field id="publisher" label="Publisher or organization" error={s.fieldErrors?.publisher}>
            <TextInput id="publisher" maxLength={160} error={s.fieldErrors?.publisher} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="url" label="URL" error={s.fieldErrors?.url}>
              <TextInput id="url" type="url" error={s.fieldErrors?.url} />
            </Field>
          </div>
          <Field id="publishedAt" label="Published" optional error={s.fieldErrors?.publishedAt}>
            <TextInput id="publishedAt" type="date" error={s.fieldErrors?.publishedAt} />
          </Field>
          <Field id="referenceDate" label="Reference date in source" optional error={s.fieldErrors?.referenceDate}>
            <TextInput id="referenceDate" type="date" error={s.fieldErrors?.referenceDate} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="supportingExcerpt" label="Supporting excerpt" optional hint="Short quote showing the exact amount." error={s.fieldErrors?.supportingExcerpt}>
              <TextArea id="supportingExcerpt" rows={2} maxLength={1200} error={s.fieldErrors?.supportingExcerpt} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="verificationNotes" label="Verification notes" optional error={s.fieldErrors?.verificationNotes}>
              <TextArea id="verificationNotes" rows={2} maxLength={1200} error={s.fieldErrors?.verificationNotes} />
            </Field>
          </div>
        </div>
      )}
    />
  );
}

export function VerifyForm({ questionId }: { questionId: string }) {
  return (
    <ActionForm action={verifyAnswerAction} submitLabel="Mark answer verified" hidden={{ questionId }}>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="attest" className="mt-0.5 h-4 w-4 accent-[var(--green)]" />
        <span>
          I opened the source(s) and confirmed they support <strong>this exact amount</strong>, measured the way the question defines it,
          for the stated date or period.
        </span>
      </label>
    </ActionForm>
  );
}

export function StatusForm({ questionId, action, label, variant = "secondary" }: { questionId: string; action: string; label: string; variant?: "primary" | "secondary" | "danger" }) {
  return <ActionForm action={questionStatusAction} submitLabel={label} variant={variant} hidden={{ questionId, action }} className="space-y-2" />;
}

export function CorrectionForm({ questionId, attemptCount }: { questionId: string; attemptCount: number }) {
  return (
    <ActionForm
      action={correctAnswerAction}
      submitLabel="Apply correction"
      variant="danger"
      hidden={{ questionId }}
      render={(s) => (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Corrections re-score all {attemptCount} official attempts with the same formula, keep a revision record of every old score,
            recompute results, leaderboards and streaks, and show players a correction notice.
          </p>
          <Field id="newAnswer" label="Corrected amount (USD)" error={s.fieldErrors?.newAnswer}>
            <TextInput id="newAnswer" inputMode="decimal" error={s.fieldErrors?.newAnswer} />
          </Field>
          <Field id="reason" label="Reason (shown to players)" hint="At least 10 characters." error={s.fieldErrors?.reason}>
            <TextArea id="reason" rows={2} maxLength={1000} error={s.fieldErrors?.reason} />
          </Field>
          <Field id="sourceUrl" label="Source supporting the correction" error={s.fieldErrors?.sourceUrl}>
            <TextInput id="sourceUrl" type="url" error={s.fieldErrors?.sourceUrl} />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 accent-[var(--red)]" />
            <span>I understand this changes published scores for every affected player.</span>
          </label>
        </div>
      )}
    />
  );
}
