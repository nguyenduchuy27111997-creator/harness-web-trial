import Link from "next/link";

export default function BookNotFound() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <h1 className="font-heading text-title-1">Book not found</h1>
      <p className="text-muted-foreground">This book does not exist or is not on your shelf.</p>
      <Link href="/books" className="link-target self-start text-primary hover:underline">
        Back to my books
      </Link>
    </div>
  );
}
