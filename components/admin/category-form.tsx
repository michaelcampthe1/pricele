"use client";

import { ActionForm } from "@/components/admin/action-form";
import { addCategoryAction } from "@/app/admin/actions";
import { Field, TextInput } from "@/components/ui/form";

export function CategoryForm() {
  return (
    <ActionForm
      action={addCategoryAction}
      submitLabel="Add category"
      variant="secondary"
      render={(s) => (
        <Field id="name" label="New category" error={s.fieldErrors?.name}>
          <TextInput id="name" maxLength={60} error={s.fieldErrors?.name} />
        </Field>
      )}
    />
  );
}
