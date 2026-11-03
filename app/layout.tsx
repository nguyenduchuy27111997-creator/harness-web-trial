import type { Metadata } from "next";
import { Lora } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "./(auth)/actions";

// Blocking render (design M2): a page's notFound() must be able to answer 404 before anything streams.
export const instant = false;

// Headings and book titles; body text uses the system sans stack from globals.css.
const lora = Lora({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Bookshelf",
  description: "Keep track of the books you want to read, are reading and have finished.",
};

// Reads the session cookie. Awaited without a Suspense fallback so a page's notFound() can still set 404.
async function Header() {
  const user = await getUser();
  return <SiteHeader signedIn={!!user} signOut={signOut} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", "font-sans", lora.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        {children}
      </body>
    </html>
  );
}
