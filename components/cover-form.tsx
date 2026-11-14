"use client";

import { useActionState, useState } from "react";
import { BookCover } from "@/components/book-cover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { COVER_ERROR, COVER_MAX_BYTES, COVER_TYPES, type CoverFormState } from "@/lib/covers";

type Props = {
  title: string;
  url: string | null;
  uploadAction: (prev: CoverFormState, formData: FormData) => Promise<CoverFormState>;
  removeAction: (formData: FormData) => Promise<void>;
};

export function CoverForm({ title, url, uploadAction, removeAction }: Props) {
  const [state, formAction] = useActionState(uploadAction, {} as CoverFormState);
  const [clientError, setClientError] = useState<string>();
  const error = clientError ?? state.error;
  const label = url ? "Replace cover" : "Add cover";

  // The same size and type check as the server's, so a file the action cannot take never leaves the browser.
  function submit(formData: FormData) {
    const file = formData.get("cover");
    if (!(file instanceof File) || file.size === 0 || file.size > COVER_MAX_BYTES || !COVER_TYPES[file.type]) {
      setClientError(COVER_ERROR);
      return;
    }
    setClientError(undefined);
    formAction(formData);
  }

  return (
    <section aria-label="Cover" className="flex flex-col gap-3">
      <BookCover title={title} url={url} size="lg" />
      <form action={submit} className="flex flex-col gap-2">
        <Label htmlFor="cover">Cover image</Label>
        <Input
          id="cover"
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={() => setClientError(undefined)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <PendingSubmitButton variant="outline" className="self-start" pendingLabel="Uploading…">
          {label}
        </PendingSubmitButton>
      </form>
      {url && (
        <form action={removeAction}>
          <PendingSubmitButton variant="outline" pendingLabel="Removing…">
            Remove cover
          </PendingSubmitButton>
        </form>
      )}
    </section>
  );
}
