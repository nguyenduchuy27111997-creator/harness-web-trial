"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { GoalFormState } from "@/lib/goals";

type Props = {
  goal: number | null;
  submitLabel: string;
  action: (prev: GoalFormState, formData: FormData) => Promise<GoalFormState>;
  onCancel?: () => void;
};

export function GoalForm({ goal, submitLabel, action, onCancel }: Props) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {} as GoalFormState);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <FormField
        id={`${id}-goal`}
        name="goal"
        label="Reading goal"
        inputMode="numeric"
        defaultValue={state.values?.goal ?? goal ?? ""}
        error={state.fieldErrors?.goal ?? state.formError}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
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
