// `fill`: small under 1024 px (a list row), the full cell width at 2:3 from 1024 px (the /books grid, design M9).
const SIZES = {
  sm: { w: 40, h: 60, box: "h-15 w-10 text-headline" },
  lg: { w: 128, h: 192, box: "h-48 w-32 text-large-title" },
  fill: { w: 40, h: 60, box: "h-15 w-10 text-headline lg:aspect-2/3 lg:h-auto lg:w-full lg:text-large-title" },
} as const;

// A fixed-size box either way, so nothing shifts when the image loads.
export function BookCover({ title, url, size, author, className = "" }: { title: string; url: string | null; size: keyof typeof SIZES; author?: string; className?: string }) {
  const { w, h, box } = SIZES[size];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a signed URL of a private file
      <img src={url} alt={`Cover of ${title}`} width={w} height={h} className={`${box} shrink-0 rounded-md object-cover ${size === "sm" ? "" : "dark:brightness-90"} ${className}`} />
    );
  }
  return (
    <div
      aria-hidden="true"
      data-testid="cover-placeholder"
      className={`${box} flex shrink-0 items-center justify-center rounded-md border bg-muted font-heading font-semibold text-muted-foreground ${className}`}
    >
      <span className={size === "fill" ? "lg:hidden" : ""}>{title.trim().charAt(0).toUpperCase()}</span>
      {size === "fill" && (
        // From 1024 px a designed cover: title and author inset on the muted card (design M9).
        <span className="hidden size-full flex-col justify-between gap-2 overflow-hidden p-4 text-start lg:flex">
          <span data-text={title} className="line-clamp-5 font-heading text-title-3 font-semibold text-foreground content-data" />
          {author && <span data-text={author} className="line-clamp-2 font-sans text-footnote font-normal content-data" />}
        </span>
      )}
    </div>
  );
}
