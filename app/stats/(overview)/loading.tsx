// The shelf reads the session, so the page streams in behind this boundary.
export default function Loading() {
  return <p className="w-full max-w-3xl text-muted-foreground">Loading…</p>;
}
