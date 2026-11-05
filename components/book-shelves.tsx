"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AddToShelfFormState, Shelf } from "@/lib/shelves";

type Props = {
  shelves: Shelf[];
  onShelfIds: string[];
  action: (prev: AddToShelfFormState, formData: FormData) => Promise<AddToShelfFormState>;
  removeAction: (shelfId: string, formData: FormData) => Promise<void>;
};

export function BookShelves({ shelves, onShelfIds, action, removeAction }: Props) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {} as AddToShelfFormState);
  const on = shelves.filter((shelf) => onShelfIds.includes(shelf.id));
  const available = shelves.filter((shelf) => !onShelfIds.includes(shelf.id));
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">Shelves</h2>
      {shelves.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have no shelves yet.{" "}
          <Link href="/shelves" className="text-primary underline">
            Make a shelf
          </Link>{" "}
          to put this book on it.
        </p>
      ) : (
        <>
          {on.length === 0 ? (
            <p className="text-sm text-muted-foreground">This book is on no shelves.</p>
          ) : (
            <ul aria-label="Shelves this book is on" className="flex flex-col gap-1">
              {on.map((shelf) => (
                <li key={shelf.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 break-words">{shelf.name}</span>
                  <form action={removeAction.bind(null, shelf.id)}>
                    {/* Icon only: the item's text stays the shelf name. */}
                    <Button type="submit" variant="ghost" size="icon" aria-label={`Remove from ${shelf.name}`}>
                      <XIcon aria-hidden />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {available.length > 0 && (
            <form action={formAction} noValidate className="flex flex-col gap-2">
              <Label htmlFor={`${id}-shelf`}>Shelf</Label>
              <div className="flex gap-3">
                {/* Remount after each add so the picker clears and offers only the shelves the book is not on. */}
                <Select key={onShelfIds.join()} name="shelf">
                  <SelectTrigger id={`${id}-shelf`} aria-invalid={state.fieldErrors?.shelf ? true : undefined}>
                    <SelectValue placeholder="Choose a shelf" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((shelf) => (
                      <SelectItem key={shelf.id} value={shelf.id}>
                        {shelf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={pending}>
                  {pending ? "Adding…" : "Add to shelf"}
                </Button>
              </div>
              {state.fieldErrors?.shelf && <p className="text-sm text-destructive">{state.fieldErrors.shelf}</p>}
              {state.formError && (
                <p role="alert" className="text-sm text-destructive">
                  {state.formError}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}
