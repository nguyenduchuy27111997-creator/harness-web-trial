"use client";

import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { signIn } from "../actions";

export function SignInForm({ deleted }: { deleted?: boolean }) {
  return (
    <AuthForm
      action={signIn}
      title="Sign in"
      notice={deleted ? "Your account was deleted" : undefined}
      description="Welcome back. Sign in to see your books."
      pendingLabel="Signing in…"
      passwordAutoComplete="current-password"
      footer={
        <>
          New here?{" "}
          <Link href="/sign-up" className="text-primary underline underline-offset-4">
            Sign up
          </Link>
        </>
      }
    />
  );
}
