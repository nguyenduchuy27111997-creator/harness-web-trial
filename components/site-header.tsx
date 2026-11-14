import Link from "next/link";
import { Button } from "@/components/ui/button";

type SiteHeaderProps = { signedIn: boolean; displayName?: string | null; signOut: () => Promise<void> };

export function SiteHeader({ signedIn, displayName, signOut }: SiteHeaderProps) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-8">
        <Link href={signedIn ? "/books" : "/"} className="font-heading text-xl font-semibold">
          Bookshelf
        </Link>
        {signedIn && (
          <nav className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/books">My books</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/shelves">Shelves</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/tags">Tags</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/quotes">Quotes</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/up-next">Up next</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/stats">Stats</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/library">Import / export</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/settings">Settings</Link>
            </Button>
            {displayName && <span className="break-all text-muted-foreground">{displayName}</span>}
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
