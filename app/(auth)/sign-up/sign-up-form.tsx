"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/form-field";
import type { AuthFormState } from "@/lib/auth";
import { signUp } from "../actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, {} as AuthFormState);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:p-8">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="font-heading text-2xl font-semibold">Sign up</h1>
          </CardTitle>
          <CardDescription>Create an account to keep track of your books.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} noValidate className="flex flex-col gap-4">
            {state.formError && (
              <p role="alert" className="text-sm text-destructive">
                {state.formError}
              </p>
            )}
            <FormField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              defaultValue={state.values?.email}
              error={state.fieldErrors?.email}
            />
            <FormField
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              error={state.fieldErrors?.password}
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Signing up…" : "Sign up"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/sign-in" className="text-primary underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
