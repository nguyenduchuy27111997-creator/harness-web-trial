// Lets e2e tooling tell this app apart from anything else on the same port
// (playwright.config.ts waits for this route before testing).
export function GET() {
  return Response.json({ app: "bookshelf" });
}
