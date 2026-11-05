"use client";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

type Props = {
  title: string;
  action: (formData: FormData) => Promise<void>;
};

export function DeleteBookButton({ title, action }: Props) {
  return (
    <ConfirmDeleteDialog
      heading="Delete this book?"
      description={`“${title}” will be removed from your shelf. This cannot be undone.`}
      triggerClassName="self-start"
      action={action}
    />
  );
}
