import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

// Redirecting at request time keeps the prerender (and its instant validation) free of a thrown redirect.
async function GoToBooks() {
  await connection();
  redirect("/books");
  return null;
}

export default function Home() {
  return (
    <Suspense>
      <GoToBooks />
    </Suspense>
  );
}
