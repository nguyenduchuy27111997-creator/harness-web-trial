import Link from "next/link";

export default function BookNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Book not found</h1>
      <p className="text-muted-foreground">This book does not exist or is not on your shelf.</p>
      <Link href="/books" className="self-start text-primary hover:underline">
        Back to my books
      </Link>
    </main>
  );
}
