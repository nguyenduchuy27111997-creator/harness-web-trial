"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { COVER_ERROR, COVER_MAX_BYTES, COVER_TYPES, type CoverFormState } from "@/lib/covers";

type Props = {
  url: string | null;
  uploadAction: (prev: CoverFormState, formData: FormData) => Promise<CoverFormState>;
  removeAction: (formData: FormData) => Promise<void>;
};

export function CoverForm({ url, uploadAction, removeAction }: Props) {
  const [state, formAction] = useActionState(uploadAction, {} as CoverFormState);
  const [clientError, setClientError] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
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
    <section aria-label="Cover" className="flex max-w-80 flex-wrap justify-center gap-2 md:justify-start">
      <form action={submit} className="flex flex-wrap justify-center gap-2 md:justify-start">
        {/* The native file control stays hidden; the button opens its picker. */}
        <Input
          ref={input}
          id="cover"
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Cover image"
          tabIndex={-1}
          className="sr-only"
          onChange={(e) => {
            setClientError(undefined);
            setFileName(e.currentTarget.files?.[0]?.name);
          }}
        />
        <Button type="button" variant="outline" onClick={() => input.current?.click()}>
          Choose image
        </Button>
        {fileName && <p className="basis-full truncate text-center text-subheadline text-muted-foreground md:text-left">{fileName}</p>}
        {error && (
          <p role="alert" className="basis-full text-center text-subheadline text-destructive md:text-left">
            {error}
          </p>
        )}
        <PendingSubmitButton variant="secondary" pendingLabel="Uploading…">
          {label}
        </PendingSubmitButton>
      </form>
      {url && (
        <form action={removeAction}>
          <PendingSubmitButton variant="destructive" pendingLabel="Removing…">
            Remove cover
          </PendingSubmitButton>
        </form>
      )}
    </section>
  );
}
