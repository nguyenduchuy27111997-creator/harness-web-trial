"use client";

import { Loader2Icon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type Props = Omit<ComponentProps<typeof Button>, "type" | "children"> & { children: ReactNode; pendingLabel: ReactNode };

// A form's submit button that disables itself and shows pendingLabel while the form's action runs.
export function PendingSubmitButton({ children, pendingLabel, disabled, ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending && <Loader2Icon aria-hidden className="animate-spin" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
