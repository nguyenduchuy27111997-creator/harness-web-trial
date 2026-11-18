#!/usr/bin/env python3
"""A failed e2e run, packed small for the CI doctor and the fixer: per failed test its error, its last steps, the
console errors, the requests that failed (grouped by endpoint) and the screenshot, then the dev server's errors.
What is missing is said, never guessed: a test with no trace says so. Reads Playwright's output folders as
scripts/e2e.sh and CI leave them (test-results/<test>/error-context.md, trace.zip, *.png; playwright-report/server.log).

    python3 harness/e2e_packet.py test-results playwright-report [more dirs, e.g. downloaded CI artifacts]
"""
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
TEMPLATES = [  # path segments that vary per request, as one endpoint (REA's api-surface templating)
    (re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I), "{uuid}"),
    (re.compile(r"^\d+$"), "{numeric}"),
    (re.compile(r"^[0-9a-f]{32,}$", re.I), "{hex}"),
    (re.compile(r"^\d{4}-\d\d-\d\d"), "{iso-date}"),
]
PER_TEST, TOTAL = 2400, 8000


def endpoint(method, url):
    m = re.match(r"^\w+://[^/]+(/[^?#]*)?", url)
    path = (m.group(1) if m else url) or "/"
    segs = [next((name for rx, name in TEMPLATES if rx.match(s)), s) for s in path.split("/")]
    return f"{method} {'/'.join(segs)}"


def read_trace(path):
    """Steps, console errors, page errors and failed requests from a Playwright trace.zip."""
    out = {"steps": [], "console": [], "page_errors": [], "requests": Counter()}
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.endswith((".trace", ".network")):
                continue
            for line in z.read(name).decode(errors="replace").splitlines():
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                kind = e.get("type")
                if name == "test.trace" and kind == "before" and e.get("method") in ("pw:api", "expect", "test.step"):
                    out["steps"].append(e.get("title") or e.get("method"))
                elif kind == "console" and e.get("messageType") in ("error", "warning"):
                    where = (e.get("location") or {}).get("url") or ""
                    out["console"].append(f"{e.get('messageType')}: {e.get('text', '')[:200]}" + (f" ({where})" if where else ""))
                elif kind == "event" and e.get("method") == "pageError":
                    err = (e.get("params") or {}).get("error") or {}
                    out["page_errors"].append(str(err.get("error", {}).get("message") or err.get("message") or err)[:200])
                elif kind == "resource-snapshot":
                    s = e.get("snapshot") or {}
                    req, res = s.get("request") or {}, s.get("response") or {}
                    status = res.get("status")
                    failure = s.get("_failureText")
                    if failure or (isinstance(status, int) and (status >= 400 or status <= 0)):
                        out["requests"][f"{endpoint(req.get('method', '?'), req.get('url', ''))} → "
                                        f"{failure or status}"] += 1
    return out


def test_section(d):
    lines, unknowns = [], []
    ctx = d / "error-context.md"
    text = ANSI.sub("", ctx.read_text(errors="replace")) if ctx.exists() else ""
    name = re.search(r"^- Name: (.+)$", text, re.M)
    where = re.search(r"^- Location: (.+)$", text, re.M)
    lines.append(f"## {name.group(1) if name else d.name}" + (f" ({where.group(1)})" if where else ""))
    err = re.search(r"# Error details\s+```\s*\n(.*?)\n```", text, re.S)
    if err:
        lines.append("Error:\n" + "\n".join(err.group(1).strip().splitlines()[:14]))
    else:
        unknowns.append("no error-context.md: the error is only in the run's log")
    traces = sorted(d.glob("trace*.zip"))
    if traces:
        try:
            t = read_trace(traces[-1])
            if t["steps"]:
                lines.append("Last steps: " + " → ".join(t["steps"][-6:]))
            if t["page_errors"]:
                lines.append("Page errors:\n" + "\n".join(f"- {x}" for x in dict.fromkeys(t["page_errors"]))[:600])
            if t["console"]:
                uniq = list(dict.fromkeys(t["console"]))
                lines.append(f"Console errors ({len(t['console'])}):\n" + "\n".join(f"- {x}" for x in uniq[:6]))
            if t["requests"]:
                lines.append("Failed requests:\n" + "\n".join(f"- {k} ×{n}" for k, n in t["requests"].most_common(8)))
            else:
                lines.append("Failed requests: none recorded in the trace")
            lines.append(f"Trace: {traces[-1]} (npx playwright show-trace <it>)")
        except (zipfile.BadZipFile, OSError, KeyError) as e:
            unknowns.append(f"the trace could not be read ({e})")
    else:
        unknowns.append("no trace: console and network were not recorded for this run")
    shots = sorted(p.name for p in d.glob("*.png"))
    if shots:
        lines.append(f"Screenshots: {', '.join(str(d / s) for s in shots[:4])}")
    if unknowns:
        lines.append("Unknown: " + "; ".join(unknowns))
    out = "\n".join(lines)
    return out if len(out) <= PER_TEST else out[:PER_TEST - 20] + "\n…(cut)"


def server_errors(log):
    rows = log.read_text(errors="replace").splitlines()
    hits = [ANSI.sub("", r) for r in rows if re.search(r"error|⨯|unhandled|exception|failed", r, re.I)]
    picked = hits[-12:] or [ANSI.sub("", r) for r in rows[-8:]]
    return f"## Dev server ({log})\n" + "\n".join(x[:240] for x in picked)


def packet(dirs):
    roots = [Path(x) for x in dirs if Path(x).exists()]
    failed = sorted({p.parent for r in roots for p in r.rglob("*")
                     if p.name == "error-context.md" or p.name.startswith("trace") and p.suffix == ".zip"
                     or p.name.startswith("test-failed")})
    logs = [p for r in roots for p in r.rglob("server.log")]
    # A test retried (CI's retry, the local rerun) leaves a folder per run: one section, the last run's, says so.
    sections = {}
    for d in failed:
        text = test_section(d)
        key = text.split("\n", 1)[0]
        runs = sections[key][1] + 1 if key in sections else 1
        sections[key] = (text, runs)
    parts = [t if n == 1 else t.replace("\n", f"\nFailed on all {n} runs (retries included).\n", 1)
             for t, n in sections.values()]
    if logs:
        parts.append(server_errors(logs[0]))
    if not parts:
        return ""
    head = f"# e2e failure packet: {len(sections)} failed test(s)"
    body, kept = head, 0
    for p in parts:
        if len(body) + len(p) + 2 > TOTAL:
            break
        body += "\n\n" + p
        kept += 1
    if kept < len(parts):
        body += f"\n\n…{len(parts) - kept} more section(s) left out (over {TOTAL} characters)"
    return body


if __name__ == "__main__":
    text = packet(sys.argv[1:] or ["test-results", "playwright-report"])
    print(text or "e2e packet: no failed test found in " + ", ".join(sys.argv[1:] or ["test-results", "playwright-report"]))
