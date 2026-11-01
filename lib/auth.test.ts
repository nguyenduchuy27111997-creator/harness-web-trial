import { describe, expect, it } from "vitest";
import { parseSignUp } from "./auth";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseSignUp", () => {
  it("accepts a trimmed email and a 6-character password", () => {
    expect(parseSignUp(form({ email: "  a@b.co ", password: "123456" }))).toEqual({
      ok: true,
      value: { email: "a@b.co", password: "123456" },
    });
  });

  it("requires an email", () => {
    expect(parseSignUp(form({ email: "  ", password: "123456" }))).toEqual({
      ok: false,
      fieldErrors: { email: "Email is required" },
    });
  });

  it.each(["ab.co", "@b.co", "a@", "a@b@c"])("rejects %s as an email", (email) => {
    expect(parseSignUp(form({ email, password: "123456" }))).toEqual({
      ok: false,
      fieldErrors: { email: "Enter a valid email" },
    });
  });

  it("rejects a 5-character or missing password", () => {
    const error = { ok: false, fieldErrors: { password: "Password must be at least 6 characters" } };
    expect(parseSignUp(form({ email: "a@b.co", password: "12345" }))).toEqual(error);
    expect(parseSignUp(form({ email: "a@b.co" }))).toEqual(error);
  });
});
