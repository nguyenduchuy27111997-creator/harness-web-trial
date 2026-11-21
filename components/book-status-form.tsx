"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useActionState, useRef, useState } from "react";
import { quick, spring } from "@/components/motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BOOK_STATUSES, STATUS_LABELS, type BookStatus, type StatusFormState } from "@/lib/books";

type Props = {
  status: BookStatus;
  action: (prev: StatusFormState, formData: FormData) => Promise<StatusFormState>;
};

export function BookStatusForm({ status, action }: Props) {
  // With reduced motion a press scale would jump, not animate, so there is none.
  const reduceMotion = useReducedMotion();
  const [state, formAction, pending] = useActionState(action, {} as StatusFormState);
  // The pick shows while it saves; afterwards the segments follow the saved status (Read again changes it too).
  const [pick, setPick] = useState<BookStatus | null>(null);
  const picked = pending && pick ? pick : status;
  const formRef = useRef<HTMLFormElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  return (
    <MotionConfig reducedMotion="user">
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-2">
      <Label id="status-label">Status</Label>
      <Input ref={hiddenRef} type="hidden" name="status" value={picked} readOnly />
      <RadioGroup
        key={status}
        aria-labelledby="status-label"
        value={picked}
        disabled={pending}
        onValueChange={(value) => {
          // Radix puts the group back to its first value when React resets the form after the action.
          if (pending || value === picked) return;
          setPick(value as BookStatus);
          // The hidden input holds the old value until React re-renders; set it before submitting.
          if (hiddenRef.current) hiddenRef.current.value = value;
          formRef.current?.requestSubmit();
        }}
        className="w-full gap-0 rounded-lg bg-muted p-1 dark:border dark:bg-card"
      >
        {BOOK_STATUSES.map((s) => (
          <RadioGroupItem
            asChild
            key={s}
            value={s}
            disabled={pending}
            className="min-h-11 flex-1 rounded-md px-3 text-subheadline whitespace-nowrap text-muted-foreground max-md:px-2 hover:text-foreground relative aria-checked:font-medium aria-checked:text-foreground lg:min-h-8"
          >
            <motion.button type="button" whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={quick}>
              {s === picked && (
                <motion.span
                  layoutId="status-indicator"
                  transition={spring}
                  aria-hidden
                  className="absolute inset-0 rounded-md bg-background dark:bg-popover"
                />
              )}
              <span className="relative">{STATUS_LABELS[s]}</span>
            </motion.button>
          </RadioGroupItem>
        ))}
      </RadioGroup>
      {state.fieldErrors?.status && <p className="text-subheadline text-destructive">{state.fieldErrors.status}</p>}
      {state.formError && (
        <p role="alert" className="text-subheadline text-destructive">
          {state.formError}
        </p>
      )}
      {state.saved && !pending && picked === status && (
        <p role="status" className="text-subheadline text-muted-foreground">
          Saved
        </p>
      )}
    </form>
    </MotionConfig>
  );
}
