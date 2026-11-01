"use server";

import { redirect } from "next/navigation";
import { parseSignUp, type AuthFormState } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = parseSignUp(formData);
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.value);
  if (error?.code === "user_already_exists" || (!error && data.user?.identities?.length === 0)) {
    return { formError: "An account with this email already exists", values };
  }
  if (error) return { formError: "Could not sign up. Try again.", values };
  redirect("/books");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
