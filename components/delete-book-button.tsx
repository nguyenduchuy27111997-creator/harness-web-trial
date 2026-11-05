import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type Props = {
  title: string;
  action: (formData: FormData) => Promise<void>;
};

export function DeleteBookButton({ title, action }: Props) {
  return (
    <ConfirmDeleteButton
      heading="Delete this book?"
      description={<>“{title}” will be removed from your shelf. This cannot be undone.</>}
      action={action}
    />
  );
}
