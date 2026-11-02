// The form page reads the session, so it streams in behind this boundary (cacheComponents).
export default function Loading() {
  return <p className="mx-auto w-full max-w-3xl px-4 py-8 text-muted-foreground sm:p-8">Loading…</p>;
}
