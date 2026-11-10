import type { Metadata } from "next";
import Link from "next/link";
import { booksHref } from "@/lib/books";
import { createClient, requireUser } from "@/lib/supabase/server";
import { sortTags } from "@/lib/tags";

export const metadata: Metadata = { title: "Tags · Bookshelf" };

export default async function TagsPage() {
  await requireUser();
  const { data, error } = await (await createClient()).from("tags").select("id, name");
  if (error) throw new Error(error.message);
  const tags = sortTags(data);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Tags</h1>
      {tags.length === 0 ? (
        <p className="text-muted-foreground">No tags yet. Add one from a book&apos;s page.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((t) => (
            <li key={t.id}>
              <Link href={booksHref({ tag: t.name })} className="text-primary underline">
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
