"use client";

import { useActionState, useId } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { NameFormState } from "@/lib/profile";

type Props = {
  displayName: string | null;
  action: (prev: NameFormState, formData: FormData) => Promise<NameFormState>;
};

export function DisplayNameForm({ displayName, action }: Props) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {} as NameFormState);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <FormField
        id={`${id}-name`}
        name="display_name"
        label="Display name"
        defaultValue={state.values?.display_name ?? displayName ?? ""}
        error={state.fieldErrors?.display_name ?? state.formError}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.saved && <p role="status" className="text-sm text-muted-foreground">Saved</p>}
      </div>
    </form>
  );
}
