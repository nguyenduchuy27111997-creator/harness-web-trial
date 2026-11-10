"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { IMPORT_MAX_BYTES, type ImportState } from "@/lib/import";

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
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file && file.size > IMPORT_MAX_BYTES) {
              setState({ error: "The file is too large" });
              return;
            }
            e.currentTarget.form?.requestSubmit();
          }}
        />
        {state.error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </form>
      {state.added !== undefined && (
        <p role="status">
          Added {state.added} {state.added === 1 ? "book" : "books"}
        </p>
      )}
      {rows && state.csv !== undefined && (
        <form action={confirmAction} className="flex flex-col gap-3">
          <Input type="hidden" name="csv" value={state.csv} />
          <Table>
            <TableCaption className="sr-only">Books to add</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Title</TableHead>
                <TableHead scope="col">Author</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.author}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>{row.rating ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
