import Link from "next/link";

export default function SharedShelfNotFound() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <h1 className="font-heading text-title-1">Shelf not found</h1>
      <p className="text-muted-foreground">This link was stopped or never existed.</p>
      <Link href="/" className="link-target self-start text-primary hover:underline">
        Go to Bookshelf
      </Link>
    </div>
  );
}
