import type { Metadata } from "next";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { DisplayNameForm } from "@/components/display-name-form";
import { Button } from "@/components/ui/button";
import { getDisplayName } from "@/lib/profile";
import { createClient, requireUser } from "@/lib/supabase/server";

import { signOut } from "../(auth)/actions";
import { deleteAccountAction, saveName } from "./actions";

export const metadata: Metadata = { title: "Settings · Bookshelf" };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 *:px-4 *:py-3">
        {children}
      </div>
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const displayName = await getDisplayName(await createClient());
  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Settings</h1>
      <Group title="Profile">
        <DisplayNameForm displayName={displayName} action={saveName} />
      </Group>
      <Group title="Account">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-footnote text-muted-foreground">Email</span>
            <span data-volatile className="break-all text-body">{user.email}</span>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
      </Group>
      <Group title="Delete account">
        <div>
          <DeleteAccountDialog action={deleteAccountAction} />
        </div>
      </Group>
    </div>
  );
}
