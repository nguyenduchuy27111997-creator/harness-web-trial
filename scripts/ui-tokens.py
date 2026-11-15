#!/usr/bin/env python3
"""Design system lint (docs/design-system.md): UI code uses tokens and base components only.

Scans app/, components/ and lib/ (skipping components/ui/, the shadcn/ui components, and
app/globals.css, where the tokens are defined) and fails, one line per violation, on:
  - a color literal (#hex, rgb(), hsl(), oklch())
  - a Tailwind palette color class (bg-red-500, text-white) instead of a token (bg-primary)
  - a Tailwind arbitrary value (p-[13px], text-[#333]) instead of the scale
  - a raw <button>, <input>, <select> or <textarea> instead of components/ui/
When app/globals.css has the named type scale (imports app/ui-base.css, docs/ui-guide.md), also on:
  - a Tailwind default text size (text-sm, text-2xl) instead of a type style (text-body, text-title-2)
  - padding, margin or gap off the 4/8 grid (p-1.5, gap-7) instead of the spacing scale
"""
import re
import sys
from pathlib import Path

ROOTS = ("app", "components", "lib")
SKIP = ("components/ui/", "app/globals.css", "app/ui-base.css")
PALETTE = ("slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|"
           "violet|purple|fuchsia|pink|rose|black|white")
RULES = [
    (re.compile(r"#[0-9a-fA-F]{3,8}\b(?![\w-])|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(", re.I), "color literal: use a token"),
    (re.compile(rf"(?<![\w-])(?:[a-z-]+:)*(bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|divide|"
                rf"decoration|accent|caret|placeholder)-({PALETTE})(-\d{{2,3}})?(/\d+)?(?![\w-])"), "palette color: use a token"),
    (re.compile(r"(?<![\w\[-])(?:[a-z-]+:)*-?[a-z][a-z0-9-]*-\[[^\]\s]+\]"), "arbitrary value: use the Tailwind scale"),
    (re.compile(r"<(button|input|select|textarea)\b"), "raw element: use components/ui/"),
]
# Projects set up before the type scale existed keep the Tailwind sizes until their tokens add it.
SCALE_RULES = [
    (re.compile(r"(?<![\w-])(?:[a-z-]+:)*text-(xs|sm|base|lg|[2-9]?xl)(?![\w-])"),
     "text size: use a type style (text-body, text-title-2, ...)"),
    (re.compile(r"(?<![\w-])(?:[a-z-]+:)*-?(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|"
                r"space-x|space-y)-(1\.5|2\.5|3\.5|7|9|11)(?![\w.-])"), "spacing off the 4/8 grid: use the scale"),
]


def main(root="."):
    root = Path(root)
    problems = []
    css = root / "app/globals.css"
    scaled = css.is_file() and any(s in css.read_text() for s in ("--text-body:", "ui-base.css"))
    rules = RULES + (SCALE_RULES if scaled else [])
    for top in ROOTS:
        for path in sorted((root / top).rglob("*")) if (root / top).is_dir() else []:
            rel = path.relative_to(root).as_posix()
            if path.suffix not in (".tsx", ".ts", ".jsx", ".js", ".css") or rel.startswith(SKIP):
                continue
            for n, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
                for rule, why in rules:
                    m = rule.search(line)
                    if m:
                        problems.append(f"{rel}:{n}: {why} ({m.group(0)})")
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
