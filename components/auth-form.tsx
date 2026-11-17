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
  notice?: string;
};

// The email and password card shared by sign-in and sign-up.
export function AuthForm({ action, title, description, pendingLabel, passwordAutoComplete, footer, notice }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {} as AuthFormState);
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="font-heading text-title-2 font-semibold">{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} noValidate className="flex flex-col gap-4">
            {notice && (
              <p role="status" className="text-subheadline text-muted-foreground">
                {notice}
              </p>
            )}
            {state.formError && (
              <p role="alert" className="text-subheadline text-destructive">
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
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? pendingLabel : title}
            </Button>
            <p className="text-center text-subheadline text-muted-foreground">{footer}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
