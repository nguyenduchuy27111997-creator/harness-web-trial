"use client";

import { useId, useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Button } from "@/components/ui/button";

type Props = {
  link: string | null;
  shareAction: () => Promise<void>;
  stopAction: () => Promise<void>;
};

// Share, then the link with Copy link and Stop sharing.
export function ShareShelf({ link, shareAction, stopAction }: Props) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const labelId = useId();
  const linkId = useId();
  if (!link) {
    return (
      <form action={shareAction}>
        <PendingSubmitButton variant="outline" size="sm" pendingLabel="Sharing…">
          Share
        </PendingSubmitButton>
      </form>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span id={labelId} className="text-sm text-muted-foreground">
          Share link
        </span>
        <a
          id={linkId}
          href={link}
          aria-labelledby={`${labelId} ${linkId}`}
          className="min-w-0 flex-1 truncate text-sm text-primary underline-offset-4 hover:underline"
        >
          {link}
        </a>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopiedLink(link);
          }}
        >
          {copiedLink === link ? "Copied" : "Copy link"}
        </Button>
        <form action={stopAction}>
          <PendingSubmitButton variant="outline" size="sm" pendingLabel="Stopping…">
            Stop sharing
          </PendingSubmitButton>
        </form>
      </div>
    </div>
  );
}
