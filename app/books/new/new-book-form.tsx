"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOOK_STATUSES, STATUS_LABELS, type BookFormState } from "@/lib/books";
import { createBook } from "../actions";

export function NewBookForm() {
  const [state, action, pending] = useActionState(createBook, {} as BookFormState);
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <FormField id="title" label="Title" defaultValue={state.values?.title} error={state.fieldErrors?.title} />
      <FormField id="author" label="Author" defaultValue={state.values?.author} error={state.fieldErrors?.author} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <Select name="status" defaultValue={state.values?.status || "want_to_read"}>
          <SelectTrigger id="status" aria-invalid={state.fieldErrors?.status ? true : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOOK_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.fieldErrors?.status && <p className="text-sm text-destructive">{state.fieldErrors.status}</p>}
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/books">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
