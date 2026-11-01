import Link from "next/link";
import { Button } from "@/components/ui/button";

type SiteHeaderProps = { signedIn: boolean; signOut: () => Promise<void> };

export function SiteHeader({ signedIn, signOut }: SiteHeaderProps) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-8">
        <Link href="/books" className="font-heading text-xl font-semibold">
          Bookshelf
        </Link>
        {signedIn && (
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}
