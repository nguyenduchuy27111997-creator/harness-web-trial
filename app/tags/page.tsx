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
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Tags</h1>
      {tags.length === 0 ? (
        <p className="text-muted-foreground">No tags yet. Add tags from a book&apos;s page.</p>
      ) : (
        <RenameTagList tags={tags.map((tag) => ({ ...tag, action: renameTagAction.bind(null, tag.id) }))} />
      )}
    </div>
  );
}
