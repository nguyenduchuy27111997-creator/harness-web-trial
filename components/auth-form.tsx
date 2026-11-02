"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/form-field";
import type { AuthFormState } from "@/lib/auth";

type AuthFormProps = {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  title: string;
  description: string;
  pendingLabel: string;
  passwordAutoComplete: "current-password" | "new-password";
  footer: ReactNode;
};

// The email and password card shared by sign-in and sign-up.
export function AuthForm({ action, title, description, pendingLabel, passwordAutoComplete, footer }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {} as AuthFormState);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:p-8">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="font-heading text-2xl font-semibold">{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} noValidate className="flex flex-col gap-4">
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
              autoComplete={passwordAutoComplete}
              error={state.fieldErrors?.password}
            />
            <Button type="submit" disabled={pending}>
              {pending ? pendingLabel : title}
            </Button>
            <p className="text-sm text-muted-foreground">{footer}</p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
