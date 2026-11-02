"use client";

import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { signUp } from "../actions";

export function SignUpForm() {
  return (
    <AuthForm
      action={signUp}
      title="Sign up"
      description="Create an account to keep track of your books."
      pendingLabel="Signing up…"
      passwordAutoComplete="new-password"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-primary underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    />
  );
}
