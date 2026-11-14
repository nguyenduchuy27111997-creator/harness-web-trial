"use client";

import { useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Button } from "@/components/ui/button";

type Props = {
  link: string | null;
  shareAction: () => Promise<void>;
  stopAction: () => Promise<void>;
};

// Share, then the link with Copy link and Stop sharing.
export function ShareShelf({ link, shareAction, stopAction }: Props) {
  const [copied, setCopied] = useState(false);
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 break-all rounded-md border px-2 py-1 text-sm">{link}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
      <form action={stopAction}>
        <PendingSubmitButton variant="outline" size="sm" pendingLabel="Stopping…">
          Stop sharing
        </PendingSubmitButton>
      </form>
    </div>
  );
}
