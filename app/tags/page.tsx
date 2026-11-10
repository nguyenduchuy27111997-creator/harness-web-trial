import type { Metadata } from "next";
import { renameTagAction } from "@/app/tags/actions";
import { RenameTagList } from "@/components/rename-tag-form";
import { listTags } from "@/lib/tags";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tags · Bookshelf" };

export default async function TagsPage() {
  await requireUser();
  const tags = await listTags(await createClient());
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Tags</h1>
      {tags.length === 0 ? (
        <p className="text-muted-foreground">No tags yet. Add tags from a book&apos;s page.</p>
      ) : (
        <RenameTagList tags={tags.map((tag) => ({ ...tag, action: renameTagAction.bind(null, tag.id) }))} />
      )}
    </main>
  );
}
