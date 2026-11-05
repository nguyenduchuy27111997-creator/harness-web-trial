"use client";

import { useActionState, useState } from "react";
import { DeleteShelfButton } from "@/components/delete-shelf-button";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { ShelfFormState } from "@/lib/shelves";

type Props = {
  id: string;
  name: string;
  action: (prev: ShelfFormState, formData: FormData) => Promise<ShelfFormState>;
};

type Row = Pick<Props, "id" | "name" | "action"> & { deleteAction: (formData: FormData) => Promise<void> };

// The list of shelves: at most one rename form is open at a time.
export function RenameShelfList({ shelves }: { shelves: Row[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul className="flex flex-col gap-3">
      {shelves.map((shelf) => (
        <li key={shelf.id}>
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

function RenameShelfForm({ open, onOpen, onClose, deleteAction, ...props }: RowProps) {
  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <span>{props.name}</span>
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          Rename
        </Button>
        <DeleteShelfButton name={props.name} action={deleteAction} />
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
        <p role="alert" className="text-sm text-destructive">
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
