"use client";

import Link from "next/link";
import { useActionState, useState, type KeyboardEvent } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOOK_STATUSES, STATUS_LABELS, type BookFormState } from "@/lib/books";
import type { LookupResult } from "@/lib/lookup";
import { createBook } from "../actions";

export function NewBookForm() {
  const [state, action, pending] = useActionState(createBook, {} as BookFormState);
  // Controlled, so a lookup can fill them; the user can still edit them before saving.
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [query, setQuery] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  // The browser only calls our own route (app/api/lookup), never Open Library.
  async function lookUp() {
    setLookingUp(true);
    setLookupMessage("");
    try {
      const res = await fetch(`/api/lookup?q=${encodeURIComponent(query)}`);
      const body = (await res.json().catch(() => ({}))) as LookupResult | { error?: string };
      if ("error" in body && body.error) setLookupMessage(body.error);
      else if (!res.ok || !("status" in body)) setLookupMessage("Lookup is not available right now");
      else if (body.status === "found") {
        setTitle(body.book.title);
        setAuthor(body.book.author);
        setTotalPages(body.book.totalPages === null ? "" : String(body.book.totalPages));
      }
    } catch {
      // fetch rejects on a network error.
      setLookupMessage("Lookup is not available right now");
    } finally {
      setLookingUp(false);
    }
  }

  function lookUpOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!lookingUp) void lookUp();
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="lookup">Look up</Label>
        <div className="flex gap-2">
          <Input
            id="lookup"
            placeholder="ISBN or title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={lookUpOnEnter}
            aria-describedby={lookupMessage ? "lookup-message" : undefined}
          />
          <Button type="button" variant="outline" onClick={lookUp} disabled={lookingUp}>
            {lookingUp ? "Looking up…" : "Look up"}
          </Button>
        </div>
        <p id="lookup-message" role="status" className="text-sm text-muted-foreground">
          {lookupMessage}
        </p>
      </div>
      <FormField id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={state.fieldErrors?.title} />
      <FormField id="author" label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} error={state.fieldErrors?.author} />
      <FormField
        id="total_pages"
        label="Total pages"
        inputMode="numeric"
        value={totalPages}
        onChange={(e) => setTotalPages(e.target.value)}
        error={state.fieldErrors?.total_pages}
      />
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
