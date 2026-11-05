"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AddToShelfFormState, Shelf } from "@/lib/shelves";

type Props = {
  shelves: Shelf[];
  shelfIds: string[];
  action: (prev: AddToShelfFormState, formData: FormData) => Promise<AddToShelfFormState>;
};

export function BookShelves({ shelves, shelfIds, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as AddToShelfFormState);
  const on = shelves.filter((s) => shelfIds.includes(s.id));
  const available = shelves.filter((s) => !shelfIds.includes(s.id));
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">Shelves</h2>
        {on.length === 0 ? (
          <p className="text-muted-foreground">This book is on no shelves.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {on.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
        )}
        {shelves.length === 0 ? (
          <p className="text-muted-foreground">
            You have no shelves yet. <Link href="/shelves" className="text-primary hover:underline">Make one on the Shelves page.</Link>
          </p>
        ) : (
          available.length > 0 && (
            <form action={formAction} noValidate className="flex flex-col gap-2">
              <Label htmlFor="shelf">Shelf</Label>
              <div className="flex gap-3">
                <Select key={available.map((s) => s.id).join()} name="shelf">
                  <SelectTrigger id="shelf" aria-invalid={state.fieldErrors?.shelf ? true : undefined}>
                    <SelectValue placeholder="Choose a shelf" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
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
          )
        )}
      </CardContent>
    </Card>
  );
}
