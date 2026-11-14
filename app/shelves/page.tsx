import type { Metadata } from "next";
import { headers } from "next/headers";
import { createShelf, deleteShelf, renameShelf, shareShelfAction, stopSharingAction } from "@/app/shelves/actions";
import { RenameShelfList } from "@/components/rename-shelf-form";
import { ShelfForm } from "@/components/shelf-form";
import { listShares } from "@/lib/share";
import { listShelves } from "@/lib/shelves";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shelves · Bookshelf" };

export default async function ShelvesPage() {
  await requireUser();
  const supabase = await createClient();
  const [shelves, shares] = await Promise.all([listShelves(supabase), listShares(supabase)]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Shelves</h1>
      {shelves.length === 0 ? (
        <p className="text-muted-foreground">You have no shelves yet.</p>
      ) : (
        <RenameShelfList
          shelves={shelves.map((shelf) => ({
            ...shelf,
            action: renameShelf.bind(null, shelf.id),
            deleteAction: deleteShelf.bind(null, shelf.id),
            shareLink: shares.has(shelf.id) ? `${origin}/s/${shares.get(shelf.id)}` : null,
            shareAction: shareShelfAction.bind(null, shelf.id),
            stopSharingAction: stopSharingAction.bind(null, shelf.id),
          }))}
        />
      )}
      <ShelfForm action={createShelf} />
    </main>
  );
}
