const SIZES = { sm: { w: 40, h: 60, box: "h-15 w-10 text-headline" }, lg: { w: 128, h: 192, box: "h-48 w-32 text-large-title" } } as const;

// A fixed-size box either way, so nothing shifts when the image loads.
export function BookCover({ title, url, size, className = "" }: { title: string; url: string | null; size: "sm" | "lg"; className?: string }) {
  const { w, h, box } = SIZES[size];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a signed URL of a private file
      <img src={url} alt={`Cover of ${title}`} width={w} height={h} className={`${box} shrink-0 rounded-md object-cover ${size === "lg" ? "dark:brightness-90" : ""} ${className}`} />
    );
  }
  return (
    <div
      aria-hidden="true"
      data-testid="cover-placeholder"
      className={`${box} flex shrink-0 items-center justify-center rounded-md border bg-muted font-heading font-semibold text-muted-foreground ${className}`}
    >
      {title.trim().charAt(0).toUpperCase()}
    </div>
  );
}
