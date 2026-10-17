"use client";

import { ActionForm } from "@/components/admin/action-form";
import { assignQuestionAction, createDailySetAction, publishSetAction, unpublishSetAction } from "@/app/admin/actions";
import { Field, Select, TextInput } from "@/components/ui/form";
import { DIFFICULTY_LABEL } from "@/lib/game/types";

export function CreateSetForm({ defaultDate, minDate }: { defaultDate: string; minDate: string }) {
  return (
    <ActionForm
      action={createDailySetAction}
      submitLabel="Create set"
      render={(s) => (
        <Field id="gameDate" label="Game date (Eastern Time)" error={s.fieldErrors?.gameDate}>
          <TextInput id="gameDate" type="date" min={minDate} defaultValue={defaultDate} error={s.fieldErrors?.gameDate} />
        </Field>
      )}
    />
  );
}

export function AssignForm({
  setId,
  candidates,
}: {
  setId: string;
  candidates: { id: string; prompt: string; difficulty: "easy" | "medium" | "hard"; category: string; isSample: boolean }[];
}) {
  return (
    <ActionForm
      action={assignQuestionAction}
      submitLabel="Assign"
      variant="secondary"
      hidden={{ setId }}
      render={(s) => (
        <Field id="questionId" label="Approved question" hint="It goes into the slot matching its difficulty." error={s.fieldErrors?.questionId}>
          <Select id="questionId" defaultValue="">
            <option value="" disabled>
              {candidates.length ? "Choose an approved question…" : "No approved questions available"}
            </option>
            {(["easy", "medium", "hard"] as const).map((d) => (
              <optgroup key={d} label={DIFFICULTY_LABEL[d]}>
                {candidates
                  .filter((c) => c.difficulty === d)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.isSample ? "[Sample] " : ""}
                      {c.prompt.slice(0, 90)} ({c.category})
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      )}
    />
  );
}

export function PublishForm({ setId, gameDate }: { setId: string; gameDate: string }) {
  return (
    <ActionForm action={publishSetAction} submitLabel="Publish set" hidden={{ setId }}>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 accent-[var(--green)]" />
        <span>
          Publish this set for {gameDate}. After publication its questions are locked, and it can only be withdrawn before anyone plays.
        </span>
      </label>
    </ActionForm>
  );
}

export function UnpublishForm({ setId }: { setId: string }) {
  return (
    <ActionForm
      action={unpublishSetAction}
      submitLabel="Return to draft"
      variant="danger"
      hidden={{ setId }}
      render={(s) => (
        <Field id="reason" label="Reason" hint="Only possible while nobody has played this set." error={s.fieldErrors?.reason}>
          <TextInput id="reason" maxLength={300} error={s.fieldErrors?.reason} hint />
        </Field>
      )}
    />
  );
}
