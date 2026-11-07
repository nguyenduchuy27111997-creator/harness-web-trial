"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { DatesFormState } from "@/lib/books";

type Props = {
  startedOn: string | null;
  finishedOn: string | null;
  action: (prev: DatesFormState, formData: FormData) => Promise<DatesFormState>;
};

export function EditDatesForm(props: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        Edit dates
      </Button>
    );
  }
  return <OpenForm {...props} onClose={() => setOpen(false)} />;
}

// Mounted only while editing, so closing drops any error and rejected input.
function OpenForm({ startedOn, finishedOn, action, onClose }: Props & { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: DatesFormState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.saved) onClose();
      return next;
    },
    {} as DatesFormState,
  );
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <FormField
        id="started_on"
        label="Started"
        type="date"
        defaultValue={state.values?.started_on ?? startedOn ?? ""}
        error={state.fieldErrors?.started_on}
      />
      {finishedOn !== null && (
        <FormField
          id="finished_on"
          label="Finished"
          type="date"
          defaultValue={state.values?.finished_on ?? finishedOn}
          error={state.fieldErrors?.finished_on}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
