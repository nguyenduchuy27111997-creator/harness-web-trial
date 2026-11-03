import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// A convenience redirect; requireUser() in each page and RLS are the real guards.
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL(user ? "/books" : "/sign-in", request.url));
  }
  if (!user && (request.nextUrl.pathname.startsWith("/books") || request.nextUrl.pathname.startsWith("/stats"))) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/harness-health).*)"],
};
