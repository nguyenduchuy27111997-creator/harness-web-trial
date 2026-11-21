import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type Props = {
  title: string;
  action: (formData: FormData) => Promise<void>;
};

export function DeleteBookButton({ title, action }: Props) {
  return (
    <ConfirmDeleteButton
      heading={`Delete ${title}?`}
      description={<>“{title}” will be removed from your shelf. This cannot be undone.</>}
      triggerVariant="destructive"
      triggerLabel="Delete book"
      action={action}
    />
  );
}
