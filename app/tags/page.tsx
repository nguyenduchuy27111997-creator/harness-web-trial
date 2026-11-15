import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
        <div className="flex flex-col items-start gap-2">
          <p className="text-title-2">No tags yet. Add tags from a book&apos;s page.</p>
          <Button asChild variant="secondary">
            <Link href="/books">Go to my books</Link>
          </Button>
        </div>
      ) : (
        <RenameTagList tags={tags.map((tag) => ({ ...tag, action: renameTagAction.bind(null, tag.id) }))} />
      )}
    </div>
  );
}
