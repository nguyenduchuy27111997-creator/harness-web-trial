import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LoadMore({ href }: { href: string }) {
  return (
    <Button asChild variant="outline" className="self-center">
      <Link href={href} scroll={false}>
        Load more
      </Link>
    </Button>
  );
}
