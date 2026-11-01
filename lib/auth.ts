import type { FieldErrors, FormState, Parsed } from "./forms";

type AuthField = "email" | "password";
type Credentials = { email: string; password: string };

// `values` never holds the password.
export type AuthFormState = FormState<AuthField>;

export const MIN_PASSWORD_LENGTH = 6;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function isEmail(value: string): boolean {
  const parts = value.split("@");
  return parts.length === 2 && parts[0] !== "" && parts[1] !== "";
}

export function parseSignUp(formData: FormData): Parsed<Credentials, AuthField> {
  const email = field(formData, "email").trim();
  const password = field(formData, "password");
  const fieldErrors: FieldErrors<AuthField> = {};
  if (!email) fieldErrors.email = "Email is required";
  else if (!isEmail(email)) fieldErrors.email = "Enter a valid email";
  if (password.length < MIN_PASSWORD_LENGTH) fieldErrors.password = "Password must be at least 6 characters";
  if (fieldErrors.email || fieldErrors.password) return { ok: false, fieldErrors };
  return { ok: true, value: { email, password } };
}
