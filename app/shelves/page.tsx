import type { Metadata } from "next";
import { createShelf } from "@/app/shelves/actions";
import { ShelfForm } from "@/components/shelf-form";
import { listShelves } from "@/lib/shelves";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shelves · Bookshelf" };

export default async function ShelvesPage() {
  await requireUser();
  const shelves = await listShelves(await createClient());
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Shelves</h1>
      {shelves.length === 0 ? (
        <p className="text-muted-foreground">You have no shelves yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shelves.map((shelf) => (
            <li key={shelf.id}>{shelf.name}</li>
          ))}
        </ul>
      )}
      <ShelfForm action={createShelf} />
    </main>
  );
}
