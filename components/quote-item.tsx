import type { ReactNode } from "react";

type Props = {
  body: string;
  meta?: ReactNode;
};

export function QuoteItem({ body, meta }: Props) {
  return (
    <li className="flex flex-col gap-1 border-l-2 border-border pl-3">
      <blockquote className="whitespace-pre-wrap break-words">{body}</blockquote>
      {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
    </li>
  );
}
