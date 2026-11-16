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
  // The picked file, tied to the cover it would replace: once an upload lands the URL changes and the pick clears.
  const [picked, setPicked] = useState<{ name: string; url: string | null }>();
  const fileName = picked?.url === url ? picked.name : undefined;
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

  // F081's spec pins "Add cover" / "Replace cover" / "Remove cover" as buttons, so no dropdown menu here.
  return (
    <section aria-label="Cover" className="flex w-full flex-col items-center gap-2 md:items-start">
      <form action={submit} className="flex w-full flex-col items-center gap-2 md:items-start">
        {/* display:none, so it has no box; the button opens its picker. */}
        <Input
          ref={input}
          id="cover"
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Cover image"
          tabIndex={-1}
          className="hidden"
          onChange={(e) => {
            setClientError(undefined);
            const name = e.currentTarget.files?.[0]?.name;
            setPicked(name ? { name, url } : undefined);
          }}
        />
        {fileName ? (
          <div className="flex w-full min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-subheadline text-muted-foreground">{fileName}</p>
            <PendingSubmitButton pendingLabel="Uploading…">{label}</PendingSubmitButton>
          </div>
        ) : (
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => input.current?.click()}>
            {label}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-center text-subheadline text-destructive md:text-left">
            {error}
          </p>
        )}
      </form>
      {url && (
        <form action={removeAction} className="w-full">
          <PendingSubmitButton variant="destructive" pendingLabel="Removing…" className="min-h-11 w-full">
            Remove cover
          </PendingSubmitButton>
        </form>
      )}
    </section>
  );
}
