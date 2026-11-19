"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { RowActions } from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TagFormState } from "@/lib/tags";

type Action = (prev: TagFormState, formData: FormData) => Promise<TagFormState>;
type Row = { id: string; name: string; count: number; action: Action };

// The list of tags. Each row's actions menu has Rename tag, which opens a dialog.
export function RenameTagList({ tags }: { tags: Row[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul className="flex flex-col divide-y">
      {tags.map((tag) => (
        <li key={tag.id} className="py-3">
          <div className="flex items-center gap-3">
            <Link href={`/books?tag=${encodeURIComponent(tag.name)}`} className="flex min-h-11 min-w-0 flex-1 items-center truncate text-headline text-primary hover:underline">
              {tag.name}
            </Link>
            <span className="ml-auto text-subheadline tabular-nums text-muted-foreground">{tag.count === 1 ? "1 book" : `${tag.count} books`}</span>
            <RowActions name={tag.name} items={[{ label: "Rename tag", onSelect: () => setOpenId(tag.id) }]} />
          </div>
          <Dialog open={openId === tag.id} onOpenChange={(next) => !next && setOpenId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename tag</DialogTitle>
              </DialogHeader>
              {openId === tag.id && <OpenForm {...tag} onClose={() => setOpenId(null)} />}
            </DialogContent>
          </Dialog>
        </li>
      ))}
    </ul>
  );
}

// Mounted only while renaming, so closing drops any error and rejected input.
function OpenForm({ id, name, action, onClose }: Row & { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: TagFormState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.saved) onClose();
      return next;
    },
    {} as TagFormState,
  );
  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      {state.formError && (
        <p role="alert" className="text-subheadline text-destructive">
          {state.formError}
        </p>
      )}
      <FormField
        id={`rename-${id}`}
        name="name"
        label="New name"
        defaultValue={state.values?.name ?? name}
        error={state.fieldErrors?.name}
      />
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
