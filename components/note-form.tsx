"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NoteFormState } from "@/lib/notes";

type Props = {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>;
};

export function NoteForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as NoteFormState);
  // React resets the form after the action: a saved note leaves the field empty, a refused one gets its text back.
  const error = state.fieldErrors?.note ?? state.formError;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <Label htmlFor="note">Note</Label>
      <Textarea
        id="note"
        name="note"
        rows={3}
        defaultValue={state.values?.note ?? ""}
        aria-invalid={state.fieldErrors?.note ? true : undefined}
        aria-describedby={error ? "note-error" : undefined}
      />
      {error && (
        <p id="note-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
