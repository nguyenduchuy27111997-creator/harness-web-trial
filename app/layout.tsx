import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { getDisplayName } from "@/lib/profile";
import { createClient, getUser } from "@/lib/supabase/server";
import { signOut } from "./(auth)/actions";

// Lora for page titles, book titles and quotes; Inter for everything else (docs/design-system.md).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const lora = Lora({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Bookshelf",
  description: "Keep track of the books you want to read, are reading and have finished.",
};

// Reads the session cookie. Awaited without a Suspense fallback so a page's notFound() can still set 404.
async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  // A failed profile read only drops the name from the account menu; it must not break every page.
  const displayName = user ? await getDisplayName(await createClient()).catch(() => null) : null;
  return (
    <AppShell signedIn={!!user} displayName={displayName} signOut={signOut}>
      {children}
    </AppShell>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", "font-sans", inter.variable, lora.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
