"use client";

import { useActionState, useState } from "react";
import { BookCover } from "@/components/book-cover";
import { DeleteShelfButton } from "@/components/delete-shelf-button";
import { FormField } from "@/components/form-field";
import { ShareShelf } from "@/components/share-shelf";
import { Button } from "@/components/ui/button";
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

// The list of shelves: at most one rename form is open at a time.
export function RenameShelfList({ shelves }: { shelves: Row[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul className="flex flex-col divide-y">
      {shelves.map((shelf) => (
        <li key={shelf.id} className="py-3">
          <RenameShelfForm
            {...shelf}
            open={openId === shelf.id}
            onOpen={() => setOpenId(shelf.id)}
            onClose={() => setOpenId(null)}
          />
        </li>
      ))}
    </ul>
  );
}

type RowProps = Row & { open: boolean; onOpen: () => void; onClose: () => void };

function RenameShelfForm({ open, onOpen, onClose, count, covers, deleteAction, shareLink, shareAction, stopSharingAction, ...props }: RowProps) {
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-16 shrink-0 -space-x-6" data-testid="shelf-covers">
            {covers.length === 0 ? (
              <BookCover title={props.name} url={null} size="sm" />
            ) : (
              covers.map((url, i) => <BookCover key={i} title={props.name} url={url} size="sm" className="ring-2 ring-background" />)
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-headline">{props.name}</span>
            <span className="text-subheadline tabular-nums text-muted-foreground">{count === 1 ? "1 book" : `${count} books`}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onOpen}>
            Rename
          </Button>
          <DeleteShelfButton name={props.name} action={deleteAction} />
        </div>
        <ShareShelf link={shareLink} shareAction={shareAction} stopAction={stopSharingAction} />
      </div>
    );
  }
  return <OpenForm {...props} onClose={onClose} />;
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
