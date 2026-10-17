"use client";

import { ActionForm } from "@/components/admin/action-form";
import { suspensionAction } from "@/app/admin/actions";
import { TextInput } from "@/components/ui/form";

export function SuspendForm({ userId, suspended }: { userId: string; suspended: boolean }) {
  return suspended ? (
    <ActionForm action={suspensionAction} submitLabel="Lift suspension" variant="secondary" hidden={{ userId, suspend: "false" }} className="space-y-2" />
  ) : (
    <ActionForm action={suspensionAction} submitLabel="Suspend" variant="danger" hidden={{ userId, suspend: "true" }} className="flex flex-wrap items-start gap-2">
      <label htmlFor={`reason-${userId}`} className="sr-only">Reason</label>
      <div className="min-w-48 flex-1">
        <TextInput id={`reason-${userId}`} name="reason" placeholder="Reason (logged)" maxLength={500} />
      </div>
    </ActionForm>
  );
}
