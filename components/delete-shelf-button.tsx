import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type Props = {
  name: string;
  action: (formData: FormData) => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function DeleteShelfButton({ name, action, open, onOpenChange }: Props) {
  return (
    <ConfirmDeleteButton
      heading="Delete this shelf?"
      description={<>“{name}” will be deleted. Its books are kept.</>}
      size="sm"
      action={action}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
