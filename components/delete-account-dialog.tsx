"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DELETE_CONFIRM_MESSAGE, DELETE_CONFIRM_WORD, type DeleteAccountState } from "@/lib/profile";

type Props = {
  action: (prev: DeleteAccountState, formData: FormData) => Promise<DeleteAccountState>;
};

export function DeleteAccountDialog({ action }: Props) {
  const id = useId();
  const [value, setValue] = useState("");
  const [state, formAction, pending] = useActionState(action, {} as DeleteAccountState);
  return (
    <Dialog onOpenChange={() => setValue("")}>
      <DialogTrigger asChild>
        <Button variant="outline" className="self-start">
          Delete account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            This deletes your account and all your books, shelves, notes, quotes, reads, tags and queue. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-confirm`}>{DELETE_CONFIRM_MESSAGE}</Label>
            <Input
              id={`${id}-confirm`}
              name="confirm"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {state.formError && (
              <p role="alert" className="text-sm text-destructive">
                {state.formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={value !== DELETE_CONFIRM_WORD || pending}>
              {pending ? "Deleting…" : "Delete my account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
