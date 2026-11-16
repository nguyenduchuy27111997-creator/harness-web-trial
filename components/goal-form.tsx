"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GoalFormState } from "@/lib/goals";

type Props = {
  goal: number | null;
  submitLabel: string;
  action: (prev: GoalFormState, formData: FormData) => Promise<GoalFormState>;
  onCancel?: () => void;
  // The id of a prompt sentence on the page that labels the field; without it the field shows "Reading goal".
  labelledBy?: string;
};

// The short number field and its buttons sit on one row, the error under them.
export function GoalForm({ goal, submitLabel, action, onCancel, labelledBy }: Props) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {} as GoalFormState);
  const inputId = `${id}-goal`;
  const errorId = `${inputId}-error`;
  const error = state.fieldErrors?.goal ?? state.formError;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      {!labelledBy && <Label htmlFor={inputId}>Reading goal</Label>}
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          name="goal"
          inputMode="numeric"
          className="w-24"
          aria-labelledby={labelledBy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          defaultValue={state.values?.goal ?? goal ?? ""}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-subheadline text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function ChangeGoal({
  goal,
  action,
}: {
  goal: number;
  action: Props["action"];
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (!open)
    return (
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Change goal
      </Button>
    );
  return (
    <GoalForm
      goal={goal}
      submitLabel="Save goal"
      onCancel={() => setOpen(false)}
      action={async (prev, formData) => {
        const next = await action(prev, formData);
        if (next.saved) setOpen(false);
        return next;
      }}
    />
  );
}
