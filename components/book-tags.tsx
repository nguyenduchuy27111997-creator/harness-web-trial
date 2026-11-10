"use client";

import { XIcon } from "lucide-react";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagChip } from "@/components/tag-chip";
import type { Tag, TagFormState } from "@/lib/tags";

type Props = {
  tags: Tag[];
  action: (prev: TagFormState, formData: FormData) => Promise<TagFormState>;
  removeAction: (tagId: string, formData: FormData) => Promise<void>;
};

export function BookTags({ tags, action, removeAction }: Props) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {} as TagFormState);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">Tags</h2>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">This book has no tags.</p>
      ) : (
        <ul aria-label="Tags on this book" className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id} className="max-w-full">
              <TagChip name={tag.name}>
                <form action={removeAction.bind(null, tag.id)}>
                  <Button type="submit" variant="ghost" size="icon-xs" aria-label={`Remove tag ${tag.name}`}>
                    <XIcon aria-hidden />
                  </Button>
                </form>
              </TagChip>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} noValidate className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Add tag</Label>
        <div className="flex gap-3">
          <Input
            key={tags.map((tag) => tag.id).join()}
            id={`${id}-name`}
            name="name"
            defaultValue={state.values?.name}
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
          <Button type="submit" disabled={pending}>
            Add
          </Button>
        </div>
        {state.fieldErrors?.name && <p className="text-sm text-destructive">{state.fieldErrors.name}</p>}
        {state.formError && (
          <p role="alert" className="text-sm text-destructive">
            {state.formError}
          </p>
        )}
      </form>
    </section>
  );
}
