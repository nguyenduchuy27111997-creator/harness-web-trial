#!/usr/bin/env python3
"""Design system lint (docs/design-system.md): UI code uses tokens and base components only.

Scans app/, components/ and lib/ (skipping components/ui/, the shadcn/ui components, and
app/globals.css, where the tokens are defined) and fails, one line per violation, on:
  - a color literal (#hex, rgb(), hsl(), oklch())
  - a Tailwind palette color class (bg-red-500, text-white) instead of a token (bg-primary)
  - a Tailwind arbitrary value (p-[13px], text-[#333]) instead of the scale
  - a raw <button>, <input>, <select> or <textarea> instead of components/ui/
"""
import re
import sys
from pathlib import Path

ROOTS = ("app", "components", "lib")
SKIP = ("components/ui/", "app/globals.css")
PALETTE = ("slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|"
           "violet|purple|fuchsia|pink|rose|black|white")
RULES = [
    (re.compile(r"#[0-9a-fA-F]{3,8}\b(?![\w-])|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(", re.I), "color literal: use a token"),
    (re.compile(rf"(?<![\w-])(?:[a-z-]+:)*(bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|divide|"
                rf"decoration|accent|caret|placeholder)-({PALETTE})(-\d{{2,3}})?(/\d+)?(?![\w-])"), "palette color: use a token"),
    (re.compile(r"(?<![\w\[-])(?:[a-z-]+:)*-?[a-z][a-z0-9-]*-\[[^\]\s]+\]"), "arbitrary value: use the Tailwind scale"),
    (re.compile(r"<(button|input|select|textarea)\b"), "raw element: use components/ui/"),
]


def main(root="."):
    root = Path(root)
    problems = []
    for top in ROOTS:
        for path in sorted((root / top).rglob("*")) if (root / top).is_dir() else []:
            rel = path.relative_to(root).as_posix()
            if path.suffix not in (".tsx", ".ts", ".jsx", ".js", ".css") or rel.startswith(SKIP) or rel == SKIP[1]:
                continue
            for n, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
                for rule, why in RULES:
                    m = rule.search(line)
                    if m:
                        problems.append(f"{rel}:{n}: {why} ({m.group(0)})")
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
