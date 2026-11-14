import { lookupBook, parseLookupQuery } from "@/lib/lookup";
import { lookupFromFixture } from "@/lib/lookup-fixture";
import { getUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!(await getUser())) return Response.json({ error: "Sign in" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q");
  if (!parseLookupQuery(q)) return Response.json({ error: "Enter an ISBN or a title" }, { status: 400 });
  const fixture = process.env.BOOK_LOOKUP_FIXTURE;
  return Response.json(fixture ? await lookupFromFixture(fixture, q) : await lookupBook(q));
}
