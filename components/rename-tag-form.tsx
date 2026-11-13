"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { TagFormState } from "@/lib/tags";

type Action = (prev: TagFormState, formData: FormData) => Promise<TagFormState>;
type Row = { id: string; name: string; count: number; action: Action };

// The list of tags: at most one rename form is open at a time.
export function RenameTagList({ tags }: { tags: Row[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ul className="flex flex-col gap-3">
      {tags.map((tag) => (
        <li key={tag.id}>
          {openId === tag.id ? (
            <OpenForm {...tag} onClose={() => setOpenId(null)} />
          ) : (
            <div className="flex items-center gap-3">
              <Link href={`/books?tag=${encodeURIComponent(tag.name)}`} className="text-primary hover:underline">
                {tag.name}
              </Link>
              <span className="text-sm text-muted-foreground">{tag.count === 1 ? "1 book" : `${tag.count} books`}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(tag.id)}>
                Rename
              </Button>
            </div>
          )}
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
