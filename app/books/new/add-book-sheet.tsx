"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NewBookForm } from "./new-book-form";

const WIDE = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(WIDE);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// null on the server and until mount, so a phone never shows the dialog first.
function useWide(): boolean | null {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => null);
}

// `/books?add=1`: a bottom sheet under 768 px, a centered dialog above; closing leaves `/books`.
export function AddBookSheet() {
  const router = useRouter();
  const params = useSearchParams();
  const wide = useWide();
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("add");
    const rest = next.toString();
    router.replace(rest ? `/books?${rest}` : "/books");
  }, [params, router]);

  const requestClose = () => (dirty ? setConfirming(true) : close());
  const form = <NewBookForm sheet onCancel={requestClose} onDirtyChange={setDirty} />;
  if (wide === null) return null;

  return (
    <>
      {wide ? (
        <Dialog open onOpenChange={(open) => !open && requestClose()}>
          <DialogContent aria-describedby={undefined} className="flex max-h-5/6 flex-col gap-0 p-0 sm:max-w-md">
            <DialogHeader className="p-4">
              <DialogTitle className="text-title-2">Add book</DialogTitle>
            </DialogHeader>
            {form}
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3">
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open onOpenChange={(open) => !open && requestClose()}>
          <SheetContent side="bottom" aria-describedby={undefined} className="gap-0 rounded-t-xl">
            <SheetHeader>
              <SheetTitle className="text-title-2">Add book</SheetTitle>
            </SheetHeader>
            {form}
          </SheetContent>
        </Sheet>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogTitle>Discard this book?</AlertDialogTitle>
          <AlertDialogDescription>What you entered will be lost.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={close}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
