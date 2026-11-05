"use client";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

type Props = {
  name: string;
  action: (formData: FormData) => Promise<void>;
};

export function DeleteShelfButton({ name, action }: Props) {
  return (
    <ConfirmDeleteDialog
      heading="Delete this shelf?"
      description={`“${name}” will be deleted. The books on it are kept.`}
      triggerSize="sm"
      action={action}
    />
  );
}
