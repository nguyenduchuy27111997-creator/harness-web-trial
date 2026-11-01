#!/usr/bin/env python3
"""E2E rules, run by scripts/check.sh:
  - golden principle 6: no single e2e test longer than LIMIT lines. A test runs from a
    line that opens `test(` (or `test.only(`, `test.skip(`, ...) to the line before the
    next one, or the end of the file;
  - golden principle 9: a spec that opens a page (`page.goto`) checks it with
    `expectAccessible(page)` from e2e/a11y.ts;
  - golden principle 8: such a spec, if this branch adds or changes it (compared with
    origin/main), also leaves a visual baseline (`toHaveScreenshot`). In a real run the reviewer
    sent two features back for a missing one, round after round.
"""
import re
import subprocess
import sys
from pathlib import Path

LIMIT = 80
PAGE = re.compile(r"\(\s*\{[^}]*\bpage\b[^}]*\}")  # a test that takes the page fixture drives the UI
START = re.compile(r"^\s*test(\.\w+)?\(\s*['\"`]")


def long_tests(path):
    lines = path.read_text().splitlines()
    starts = [i for i, line in enumerate(lines) if START.match(line)] + [len(lines)]
    for begin, end in zip(starts, starts[1:]):
        if end - begin > LIMIT:
            yield begin + 1, end - begin


def changed(root):
    """Specs whose content differs from origin/main (all of them where there is no origin/main)."""
    def git(*args):
        r = subprocess.run(["git", *args], capture_output=True, text=True, cwd=root)
        return r.stdout.split() if r.returncode == 0 else None
    top = git("rev-parse", "--show-toplevel")
    if not top or git("rev-parse", "--verify", "-q", "origin/main") is None:
        return None
    # Content that differs from main: a stacked branch carries its base's specs too, unchanged.
    paths = (git("diff", "--name-only", "--diff-filter=AM", "origin/main", "--", ".") or []) + \
        [str(Path(root, x).relative_to(top[0])) if Path(root).is_absolute() else str(Path(root, x))
         for x in (git("ls-files", "--others", "--exclude-standard", ".") or [])]
    return {(Path(top[0]) / x).resolve() for x in paths}


def main(root="e2e"):
    # Playwright keeps baselines in e2e/__screenshots__/<name>.spec.ts/: folders that match the glob.
    specs = sorted(p for p in Path(root).rglob("*.spec.ts") if p.is_file())
    found = [(p, line, size) for p in specs for line, size in long_tests(p)]
    for path, line, size in found:
        print(f"{path}:{line}: e2e test is {size} lines (limit {LIMIT}); split it or move setup into a helper")
    mine = changed(root)
    ui = [p for p in specs if "page.goto(" in p.read_text()  # any spec that opens a page,
          or (PAGE.search(p.read_text()) and (mine is None or p.resolve() in mine))]  # or a new one that uses it
    blind = [p for p in ui if "expectAccessible(" not in p.read_text()]
    for path in blind:
        print(f"{path}: opens a page but never calls expectAccessible(page) from e2e/a11y.ts")
    unseen = [p for p in ui if "toHaveScreenshot(" not in p.read_text() and (mine is None or p.resolve() in mine)]
    for path in unseen:
        print(f"{path}: opens a page but leaves no visual baseline; end it with await expect(page).toHaveScreenshot(...)")
    return 1 if found or blind or unseen else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
