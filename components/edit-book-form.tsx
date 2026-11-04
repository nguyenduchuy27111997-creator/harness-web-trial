"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { EditBookFormState } from "@/lib/books";

type Props = {
  title: string;
  author: string;
  action: (prev: EditBookFormState, formData: FormData) => Promise<EditBookFormState>;
};

export function EditBookForm(props: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }
  return <OpenForm {...props} onClose={() => setOpen(false)} />;
}

// Mounted only while editing, so closing drops any error and rejected input.
function OpenForm({ title, author, action, onClose }: Props & { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: EditBookFormState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.saved) onClose();
      return next;
    },
    {} as EditBookFormState,
  );
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <FormField id="title" label="Title" defaultValue={state.values?.title ?? title} error={state.fieldErrors?.title} />
      <FormField id="author" label="Author" defaultValue={state.values?.author ?? author} error={state.fieldErrors?.author} />
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
