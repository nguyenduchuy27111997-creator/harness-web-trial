import { Button } from "@/components/ui/button";

export function ReadAgainButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action}>
      <Button type="submit" variant="outline">
        Read again
      </Button>
    </form>
  );
}
