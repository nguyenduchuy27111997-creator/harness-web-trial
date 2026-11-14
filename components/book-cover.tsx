const SIZES = { sm: { w: 40, h: 60, box: "h-15 w-10 text-lg" }, lg: { w: 128, h: 192, box: "h-48 w-32 text-5xl" } } as const;

// A fixed-size box either way, so nothing shifts when the image loads.
export function BookCover({ title, url, size }: { title: string; url: string | null; size: "sm" | "lg" }) {
  const { w, h, box } = SIZES[size];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a signed URL of a private file
      <img src={url} alt={`Cover of ${title}`} width={w} height={h} className={`${box} shrink-0 rounded-md object-cover`} />
    );
  }
  return (
    <div
      aria-hidden="true"
      data-testid="cover-placeholder"
      className={`${box} flex shrink-0 items-center justify-center rounded-md bg-muted font-heading font-semibold text-muted-foreground`}
    >
      {title.trim().charAt(0).toUpperCase()}
    </div>
  );
}
