"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOOK_STATUSES, STATUS_LABELS, type BookStatus, type StatusFormState } from "@/lib/books";

type Props = {
  status: BookStatus;
  action: (prev: StatusFormState, formData: FormData) => Promise<StatusFormState>;
};

export function BookStatusForm({ status, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as StatusFormState);
  // "Saved" only describes the value that was submitted; hide it once the select changes again.
  const [changed, setChanged] = useState(false);
  return (
    <form action={formAction} onSubmit={() => setChanged(false)} noValidate className="flex flex-col gap-2">
      <Label htmlFor="status">Status</Label>
      <div className="flex gap-3">
        <Select key={status} name="status" defaultValue={status} onValueChange={() => setChanged(true)}>
          <SelectTrigger id="status" aria-invalid={state.fieldErrors?.status ? true : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOOK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.fieldErrors?.status && <p className="text-sm text-destructive">{state.fieldErrors.status}</p>}
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      {state.saved && !changed && !pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Saved
        </p>
      )}
    </form>
  );
}
