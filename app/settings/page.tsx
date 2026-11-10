import type { Metadata } from "next";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { DisplayNameForm } from "@/components/display-name-form";
import { getDisplayName } from "@/lib/profile";
import { createClient, requireUser } from "@/lib/supabase/server";

import { deleteAccountAction, saveName } from "./actions";

export const metadata: Metadata = { title: "Settings · Bookshelf" };

export default async function SettingsPage() {
  await requireUser();
  const displayName = await getDisplayName(await createClient());
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Settings</h1>
      <DisplayNameForm displayName={displayName} action={saveName} />
      <DeleteAccountDialog action={deleteAccountAction} />
    </main>
  );
}
