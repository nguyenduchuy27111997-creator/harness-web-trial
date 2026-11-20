"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type KeyboardEvent } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOOK_STATUSES, STATUS_LABELS, type BookFormState } from "@/lib/books";
import type { LookupBook, LookupResult } from "@/lib/lookup";
import { createBook } from "../actions";

// A small cover for a match: the image, or (none, or it failed to load) a labelled placeholder.
function MatchCover({ book }: { book: LookupBook }) {
  const [failed, setFailed] = useState(false);
  if (book.coverUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- an outside cover URL, shown only in this list
      <img src={book.coverUrl} alt={`Cover of ${book.title}`} width={40} height={60} onError={() => setFailed(true)} className="h-15 w-10 shrink-0 rounded-md object-cover" />
    );
  }
  return (
    <span role="img" aria-label={`No cover for ${book.title}`} className="flex h-15 w-10 shrink-0 items-center justify-center rounded-md border bg-muted">
      <span aria-hidden="true" className="cover-initial font-heading text-headline text-muted-foreground" data-initial={book.title.trim().charAt(0).toUpperCase()} />
    </span>
  );
}

// `sheet`: the form lives in the add sheet: Cancel calls `onCancel`, the fields scroll and the buttons stay pinned.
export function NewBookForm({ sheet, onCancel, onDirtyChange, onSaved }: { sheet?: boolean; onCancel?: () => void; onDirtyChange?: (dirty: boolean) => void; onSaved?: () => void } = {}) {
  const [state, action, pending] = useActionState(createBook, {} as BookFormState);
  // Controlled, so a lookup can fill them; the user can still edit them before saving.
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [query, setQuery] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [matches, setMatches] = useState<LookupBook[]>([]);

  useEffect(() => {
    if (state.saved) onSaved?.();
  }, [state, onSaved]);

  useEffect(() => {
    onDirtyChange?.([title, author, totalPages, query].some((v) => v.trim() !== ""));
  }, [title, author, totalPages, query, onDirtyChange]);

  function use(book: LookupBook) {
    setTitle(book.title);
    setAuthor(book.author);
    setTotalPages(book.totalPages === null ? "" : String(book.totalPages));
    setMatches([]);
  }

  // The browser only calls our own route (app/api/lookup), never Open Library.
  async function lookUp() {
    setLookingUp(true);
    setLookupMessage("");
    setMatches([]);
    try {
      const res = await fetch(`/api/lookup?q=${encodeURIComponent(query)}`);
      const body = (await res.json().catch(() => ({}))) as LookupResult | { error?: string };
      if ("error" in body && body.error) setLookupMessage(body.error);
      else if (!res.ok || !("status" in body)) setLookupMessage("Lookup is not available right now");
      else if (body.status === "found") setMatches(body.books);
      else if (body.status === "timeout") setLookupMessage("Lookup timed out, enter the book by hand");
      else if (body.status === "not_found") setLookupMessage(`No book found for ${query.trim()}`);
      else setLookupMessage("Lookup is not available right now");
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
    <form action={action} noValidate className={sheet ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-4"}>
      {sheet && <input type="hidden" name="sheet" value="1" />}
      <div className={sheet ? "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-4" : "contents"}>
      {state.formError && (
        <p role="alert" className="text-subheadline text-destructive">
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
          <Button type="button" variant="secondary" onClick={lookUp} disabled={lookingUp}>
            {lookingUp ? "Looking up…" : "Look up"}
          </Button>
        </div>
        <p id="lookup-message" role="status" className="text-subheadline text-muted-foreground">
          {lookupMessage}
        </p>
        {matches.length > 0 && (
          <ul className="flex flex-col">
            {matches.map((book, i) => (
              <li key={i}>
                <Button type="button" variant="ghost" aria-label={`Use ${book.title}`} onClick={() => use(book)} className="h-auto min-h-11 w-full justify-start gap-3 px-2 py-2 text-left">
                  <MatchCover book={book} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-heading text-headline whitespace-normal">{book.title}</span>
                    <span className="text-subheadline font-normal text-muted-foreground whitespace-normal">{book.author}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
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
        {state.fieldErrors?.status && <p className="text-subheadline text-destructive">{state.fieldErrors.status}</p>}
      </div>
      </div>
      {sheet ? (
        <div className="flex justify-between gap-3 border-t p-4 pb-safe-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add book"}
          </Button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/books">Cancel</Link>
          </Button>
        </div>
      )}
    </form>
  );
}
