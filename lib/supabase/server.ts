import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { Database } from "@/lib/database.types";

// The only way server code gets a Supabase client: the user's session lives in cookies.
export async function createClient(): Promise<SupabaseClient<Database>> {
  // The auth client reads the clock (token expiry), so it must run at request time, not in a prerender.
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only; the session is refreshed elsewhere.
        }
      },
    },
  });
}

export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
