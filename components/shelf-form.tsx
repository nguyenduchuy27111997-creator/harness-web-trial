"use client";

import { useActionState, useId } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { ShelfFormState } from "@/lib/shelves";

type Props = { action: (prev: ShelfFormState, formData: FormData) => Promise<ShelfFormState> };

export function ShelfForm({ action }: Props) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {} as ShelfFormState);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <FormField
        id={`${id}-name`}
        name="name"
        label="Name"
        defaultValue={state.values?.name ?? ""}
        error={state.fieldErrors?.name ?? state.formError}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create shelf"}
        </Button>
      </div>
    </form>
  );
}
