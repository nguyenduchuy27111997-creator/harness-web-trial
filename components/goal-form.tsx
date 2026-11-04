"use client";

import { useActionState, useId } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { GoalFormState } from "@/lib/goals";

type Props = {
  goal: number | null;
  submitLabel: string;
  action: (prev: GoalFormState, formData: FormData) => Promise<GoalFormState>;
};

export function GoalForm({ goal, submitLabel, action }: Props) {
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
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
