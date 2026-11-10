"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATUS_LABELS } from "@/lib/books";
import type { ImportState } from "@/lib/import";

type Action = (prev: ImportState, formData: FormData) => Promise<ImportState>;

export function ImportForm({ preview, confirm }: { preview: Action; confirm: Action }) {
  const id = useId();
  const [state, setState] = useState<ImportState>({});
  const [formKey, setFormKey] = useState(0);
  const [, previewAction, previewing] = useActionState(async (prev: ImportState, formData: FormData) => {
    const next = await preview(prev, formData);
    setState(next);
    return next;
  }, {});
  const [, confirmAction, adding] = useActionState(async (prev: ImportState, formData: FormData) => {
    const next = await confirm(prev, formData);
    setState(next);
    if (next.added !== undefined) setFormKey((k) => k + 1);
    return next;
  }, {});
  const reset = () => {
    setState({});
    setFormKey((k) => k + 1);
  };
  const rows = state.rows;

  return (
    <section className="flex flex-col gap-4">
      <form key={formKey} action={previewAction} className="flex flex-col gap-2">
        <Label htmlFor={`${id}-file`}>Import CSV</Label>
        <Input
          id={`${id}-file`}
          name="file"
          type="file"
          accept=".csv,text/csv"
          disabled={previewing}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-error` : undefined}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        {state.error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </form>
      {state.added !== undefined && (
        <p role="status">
          Added {state.added} {state.added === 1 ? "book" : "books"}, skipped {state.skippedCount ?? 0}
        </p>
      )}
      {rows && state.csv !== undefined && (
        <form action={confirmAction} className="flex flex-col gap-3">
          <Input type="hidden" name="csv" value={state.csv} />
          {state.skipped && state.skipped.length > 0 && (
            <div className="text-sm">
              <p role="status">
                {state.skipped.length} {state.skipped.length === 1 ? "row" : "rows"} will be skipped
              </p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {state.skipped.map((s) => (
                  <li key={s.line}>
                    Row {s.line}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Books to add</caption>
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Title</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Author</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-4">{row.title}</td>
                    <td className="py-2 pr-4">{row.author}</td>
                    <td className="py-2 pr-4">{STATUS_LABELS[row.status]}</td>
                    <td className="py-2">{row.rating ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={adding || rows.length === 0}>
              {adding ? "Adding…" : `Add ${rows.length} ${rows.length === 1 ? "book" : "books"}`}
            </Button>
            <Button type="button" variant="outline" onClick={reset} disabled={adding}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
