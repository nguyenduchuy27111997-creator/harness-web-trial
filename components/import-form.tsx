"use client";

import { useActionState, useId, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const [fileName, setFileName] = useState("");
  const [, previewAction, previewing] = useActionState(async (prev: ImportState, formData: FormData) => {
    const next = await preview(prev, formData);
    setState(next);
    return next;
  }, {});
  const [, confirmAction, adding] = useActionState(async (prev: ImportState, formData: FormData) => {
    const next = await confirm(prev, formData);
    setState(next);
    if (next.added !== undefined) {
      setFormKey((k) => k + 1);
      setFileName("");
    }
    return next;
  }, {});
  const reset = () => {
    setState({});
    setFormKey((k) => k + 1);
    setFileName("");
  };
  const rows = state.rows;

  return (
    <section className="flex flex-col gap-4">
      <form key={formKey} action={previewAction} className="flex flex-col gap-2">
        <Label id={`${id}-label`} htmlFor={`${id}-file`}>
          Import CSV
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id={`${id}-file`}
            className="peer sr-only size-px border-0 p-0"
            aria-labelledby={`${id}-label`}
            name="file"
            type="file"
            accept=".csv,text/csv"
            disabled={previewing}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? `${id}-error` : undefined}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              setFileName(file?.name ?? "");
              if (file && file.size > IMPORT_MAX_BYTES) {
                setState({ error: "The file is too large" });
                return;
              }
              e.currentTarget.form?.requestSubmit();
            }}
          />
          <label
            htmlFor={`${id}-file`}
            aria-hidden
            className={buttonVariants({
              variant: "secondary",
              className:
                "shrink-0 cursor-pointer peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:pointer-events-none peer-disabled:opacity-50",
            })}
          >
            Choose CSV file…
          </label>
          {fileName ? (
            <span className="min-w-0 flex-1 truncate text-body" title={fileName}>
              {fileName}
            </span>
          ) : (
            <span className="text-body text-muted-foreground">No file selected</span>
          )}
        </div>
        {state.error && (
          <p id={`${id}-error`} role="alert" className="text-subheadline text-destructive">
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
            <div className="text-subheadline">
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
          {rows.length === 0 ? (
            <p role="status">Nothing new to add</p>
          ) : (
            <Table>
              <TableCaption className="sr-only">Books to add</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Title</TableHead>
                  <TableHead scope="col" className="hidden sm:table-cell">Author</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-normal">
                      <span className="font-heading">{row.title}</span>
                      {row.author && (
                        <span className="block text-subheadline text-muted-foreground sm:hidden">{row.author}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{row.author}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>{row.rating ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex gap-2">
            {rows.length > 0 && (
              <Button type="submit" disabled={adding}>
                {adding ? "Adding…" : `Add ${rows.length} ${rows.length === 1 ? "book" : "books"}`}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={reset} disabled={adding}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
