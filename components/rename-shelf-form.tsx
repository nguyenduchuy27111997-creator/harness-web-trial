"use client";

import { useActionState, useState } from "react";
import { BookCover } from "@/components/book-cover";
import { DeleteShelfButton } from "@/components/delete-shelf-button";
import { FormField } from "@/components/form-field";
import { ShareShelf } from "@/components/share-shelf";
import { RowActions } from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ShelfFormState } from "@/lib/shelves";

type Props = {
  id: string;
  name: string;
  action: (prev: ShelfFormState, formData: FormData) => Promise<ShelfFormState>;
};

type Row = Pick<Props, "id" | "name" | "action"> & {
  count: number;
  covers: string[];
  deleteAction: (formData: FormData) => Promise<void>;
  shareLink: string | null;
  shareAction: () => Promise<void>;
  stopSharingAction: () => Promise<void>;
};

// The list of shelves. Each row has an actions menu: Rename and Share open a dialog, Delete shelf its confirmation.
export function RenameShelfList({ shelves }: { shelves: Row[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {shelves.map((shelf) => (
        <li key={shelf.id} className="py-3">
          <ShelfRow {...shelf} />
        </li>
      ))}
    </ul>
  );
}

function ShelfRow({ count, covers, deleteAction, shareLink, shareAction, stopSharingAction, ...props }: Row) {
  const [open, setOpen] = useState<"rename" | "share" | "delete" | null>(null);
  const onOpenChange = (next: boolean) => !next && setOpen(null);
  return (
    <div className="flex items-center gap-4">
      <div className="flex w-18 shrink-0 -space-x-6" data-testid="shelf-covers">
        {covers.length === 0 ? (
          <BookCover title={props.name} url={null} size="sm" />
        ) : (
          covers.map((url, i) => <BookCover key={i} title={props.name} url={url} size="sm" className="ring-2 ring-background" />)
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-headline">{props.name}</span>
        <span className="text-subheadline tabular-nums text-muted-foreground">{count === 1 ? "1 book" : `${count} books`}</span>
      </div>
      <RowActions
        name={props.name}
        items={[
          { label: "Rename", onSelect: () => setOpen("rename") },
          { label: "Share", onSelect: () => setOpen("share") },
          { label: "Delete shelf", onSelect: () => setOpen("delete"), destructive: true },
        ]}
      />
      <Dialog open={open === "rename"} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename shelf</DialogTitle>
          </DialogHeader>
          {open === "rename" && <OpenForm {...props} onClose={() => setOpen(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={open === "share"} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share “{props.name}”</DialogTitle>
            <DialogDescription>Anyone with the link can read this shelf. Sign-in is not needed.</DialogDescription>
          </DialogHeader>
          <ShareShelf link={shareLink} shareAction={shareAction} stopAction={stopSharingAction} />
        </DialogContent>
      </Dialog>
      <DeleteShelfButton name={props.name} action={deleteAction} open={open === "delete"} onOpenChange={onOpenChange} />
    </div>
  );
}

// Mounted only while renaming, so closing drops any error and rejected input.
function OpenForm({ id, name, action, onClose }: Props & { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ShelfFormState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.saved) onClose();
      return next;
    },
    {} as ShelfFormState,
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
