import Link from "next/link";

export default function SharedShelfNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Shelf not found</h1>
      <p className="text-muted-foreground">This link was stopped or never existed.</p>
      <Link href="/" className="self-start text-primary hover:underline">
        Go to Bookshelf
      </Link>
    </main>
  );
}
