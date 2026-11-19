import type { Metadata } from "next";
import { headers } from "next/headers";
import { createShelf, deleteShelf, renameShelf, shareShelfAction, stopSharingAction } from "@/app/shelves/actions";
import { RenameShelfList } from "@/components/rename-shelf-form";
import { ShelfForm } from "@/components/shelf-form";
import { listShares } from "@/lib/share";
import { signCovers } from "@/lib/covers";
import { listShelfSummaries } from "@/lib/shelves";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shelves · Bookshelf" };

export default async function ShelvesPage() {
  await requireUser();
  const supabase = await createClient();
  const [shelves, shares] = await Promise.all([listShelfSummaries(supabase), listShares(supabase)]);
  const urls = await signCovers(supabase, shelves.flatMap((shelf) => shelf.coverPaths));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Shelves</h1>
      {shelves.length === 0 ? (
        <p className="text-title-2">You have no shelves yet.</p>
      ) : (
        <RenameShelfList
          shelves={shelves.map((shelf) => ({
            id: shelf.id,
            name: shelf.name,
            count: shelf.count,
            covers: shelf.coverPaths.flatMap((path) => urls.get(path) ?? []),
            action: renameShelf.bind(null, shelf.id),
            deleteAction: deleteShelf.bind(null, shelf.id),
            shareLink: shares.has(shelf.id) ? `${origin}/s/${shares.get(shelf.id)}` : null,
            shareAction: shareShelfAction.bind(null, shelf.id),
            stopSharingAction: stopSharingAction.bind(null, shelf.id),
          }))}
        />
      )}
      <ShelfForm action={createShelf} />
    </div>
  );
}
