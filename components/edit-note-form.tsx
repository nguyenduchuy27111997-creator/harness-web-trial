"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NoteFormState } from "@/lib/notes";

type Props = {
  id: string;
  body: string;
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>;
  onClose: () => void;
};

// Mounted only while editing, so closing drops any error and rejected input.
export function EditNoteForm({ id, body, action, onClose }: Props) {
  const [state, formAction, pending] = useActionState(
    async (prev: NoteFormState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.saved) onClose();
      return next;
    },
    {} as NoteFormState,
  );
  const error = state.fieldErrors?.note ?? state.formError;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <Label htmlFor={`note-${id}`}>Edit note</Label>
      <Textarea
        id={`note-${id}`}
        name="note"
        rows={3}
        defaultValue={state.values?.note ?? body}
        aria-invalid={state.fieldErrors?.note ? true : undefined}
        aria-describedby={error ? `note-${id}-error` : undefined}
      />
      {error && (
        <p id={`note-${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
