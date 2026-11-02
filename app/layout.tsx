import type { Metadata } from "next";
import { Geist_Mono, Lora } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "./(auth)/actions";

// Headings and book titles; body text uses the system sans stack from globals.css.
const lora = Lora({ subsets: ["latin"], variable: "--font-serif" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // No page uses mono text yet; preloading it delayed the Lora headings (LCP budget).
  preload: false,
});

export const metadata: Metadata = {
  title: "Bookshelf",
  description: "Keep track of the books you want to read, are reading and have finished.",
};

// Reads the session cookie, so it streams in behind Suspense (cacheComponents).
async function Header() {
  const user = await getUser();
  return <SiteHeader signedIn={!!user} signOut={signOut} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistMono.variable, "font-sans", lora.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<SiteHeader signedIn={false} signOut={signOut} />}>
          <Header />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
