"use client";

import { Loader2Icon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    // The label stays "Read again" while pending: the button goes away once the read has
    // started, and e2e/read-again.spec.ts waits for exactly that.
    <Button type="submit" variant="outline" disabled={pending} aria-busy={pending}>
      {pending && <Loader2Icon aria-hidden className="animate-spin" />}
      Read again
    </Button>
  );
}

export function ReadAgainButton({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <SubmitButton />
    </form>
  );
}
