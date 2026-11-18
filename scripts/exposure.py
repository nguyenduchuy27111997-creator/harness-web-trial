#!/usr/bin/env python3
"""What the app exposes to anyone who loads it (checks from morluto/rea's release-exposure audit, for a Next.js app).

    python3 scripts/exposure.py              the repo: committed .env files, server secrets named NEXT_PUBLIC_,
                                             browser source maps switched on, the service role key in client code
    python3 scripts/exposure.py --build .next   also the built bundle: source maps, credentials, a service-role JWT
    python3 scripts/exposure.py --url https://staging.example.com   a deployed app: headers, served source maps,
                                             credentials in its scripts, API routes answered without signing in

Each check is exposed, not_observed, unknown or not_assessed, with its severity, where, and what to do. A read that
could not finish is unknown, never not_observed. It fails (exit 3) on an exposed check at --fail-on (high by
default) or above. It never says the app is secure: not_observed means these checks did not find it.
"""
import argparse
import base64
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

SEVERITY = {"low": 1, "medium": 2, "high": 3}
# Provider credential prefixes only (REA's rule list): low false positives, no generic "looks random" guessing.
CREDENTIALS = [
    ("pem.private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----")),
    ("aws.access_key_id", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github.token", re.compile(r"\bgh[opusr]_[A-Za-z0-9]{36,}\b")),
    ("gitlab.pat", re.compile(r"\bglpat-[A-Za-z0-9_-]{20,}\b")),
    ("slack.token", re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}\b")),
    ("stripe.live_secret", re.compile(r"\b[sr]k_live_[A-Za-z0-9]{16,}\b")),
    ("google.api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("npm.token", re.compile(r"\bnpm_[A-Za-z0-9]{36}\b")),
    ("anthropic.api_key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b")),
    ("openai.api_key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b")),
]
JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}\b")
SECRET_NAME = re.compile(r"NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|DB_URL|DATABASE_URL)[A-Z0-9_]*")
TEXT_LIMIT = 8 * 1024 * 1024  # bytes read per file: a bigger one is unknown, not clean
HEADERS = {  # what a deployed page should send, and why
    "content-security-policy": "limits where scripts load from (XSS)",
    "strict-transport-security": "keeps the browser on HTTPS",
    "x-content-type-options": "stops MIME sniffing (nosniff)",
    "referrer-policy": "keeps URLs out of other sites' logs",
}


class Report:
    def __init__(self):
        self.checks = []

    def add(self, cid, status, severity=None, where=(), remediation="", note=""):
        where = list(where)
        self.checks.append({"id": cid, "status": status, "severity": severity if status == "exposed" else None,
                            "locations": where[:8], "count": len(where), "remediation": remediation, "note": note})

    def worst(self):
        return max((SEVERITY[c["severity"]] for c in self.checks if c["status"] == "exposed"), default=0)

    def text(self):
        out = []
        for c in self.checks:
            sev = f" [{c['severity']}]" if c["severity"] else ""
            out.append(f"{c['status']:<13} {c['id']}{sev}" + (f": {c['note']}" if c["note"] else ""))
            out += [f"    {loc}" for loc in c["locations"]]
            if c["count"] > len(c["locations"]):
                out.append(f"    …and {c['count'] - len(c['locations'])} more")
            if c["status"] == "exposed" and c["remediation"]:
                out.append(f"    fix: {c['remediation']}")
        out.append("These checks look for known exposures; not_observed means they did not find one, not that the app "
                   "is secure.")
        return "\n".join(out)


def read_text(path):
    data = path.read_bytes()[:TEXT_LIMIT + 1]
    if b"\x00" in data[:4096]:
        return None  # binary
    return data.decode("utf-8", errors="replace")


def jwt_role(payload):
    try:
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))).get("role")
    except (ValueError, AttributeError):
        return None


def scan_text(name, text, hits, service):
    for i, line in enumerate(text.splitlines(), 1):
        for rule, rx in CREDENTIALS:
            if rx.search(line):
                hits.append(f"{name}:{i} {rule}")  # never the matched bytes
        for m in JWT.finditer(line):
            if jwt_role(m.group(1)) == "service_role":
                service.append(f"{name}:{i}")


def repo_checks(r, root):
    files = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True).stdout.split()
    envs = [f for f in files if re.match(r"(.*/)?\.env(\..+)?$", f) and not f.endswith((".example", ".sample"))]
    r.add("repo.committed_env_files", "exposed" if envs else "not_observed", "high", envs,
          "git rm --cached the file, add it to .gitignore, and rotate every key it held")
    named, maps, client = [], [], []
    for f in files:
        p = root / f
        if not p.is_file() or not (p.suffix in (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs") or ".env" in p.name):
            continue
        t = read_text(p) or ""
        for i, line in enumerate(t.splitlines(), 1):
            m = SECRET_NAME.search(line)
            if m:
                named.append(f"{f}:{i} {m.group(0)}")
        if re.match(r"next\.config\.(js|mjs|ts|cjs)$", f) and re.search(r"productionBrowserSourceMaps\s*:\s*true", t):
            maps.append(f)
        if (not f.startswith(("e2e/", "scripts/", "supabase/")) and re.match(r"\s*['\"]use client['\"]", t)
                and re.search(r"SERVICE_ROLE|service_role", t)):
            client.append(f)
    r.add("env.server_secret_named_public", "exposed" if named else "not_observed", "high", named,
          "NEXT_PUBLIC_ puts the value in every browser's bundle: drop the prefix and read it on the server only")
    r.add("next.browser_source_maps", "exposed" if maps else "not_observed", "medium", maps,
          "remove productionBrowserSourceMaps (or upload maps to your error tracker instead of serving them)")
    r.add("supabase.service_role_in_client_code", "exposed" if client else "not_observed", "high", client,
          "the service role key bypasses row level security: use it only in server code, never in a 'use client' file")


def build_checks(r, build):
    static = build / "static"
    if not static.is_dir():
        for cid in ("bundle.source_maps", "bundle.credentials", "bundle.service_role_jwt"):
            r.add(cid, "unknown", note=f"{static} is missing: run `next build` first")
        return
    with_src, without, hits, service, unread = [], [], [], [], []
    for p in sorted(static.rglob("*")):
        if not p.is_file():
            continue
        rel = str(p.relative_to(build))
        if p.stat().st_size > TEXT_LIMIT:
            unread.append(rel)
        elif p.suffix == ".map":
            try:
                (with_src if json.loads(p.read_text(errors="replace")).get("sourcesContent") else without).append(rel)
            except ValueError:
                unread.append(rel)
        else:
            t = read_text(p)
            if t is not None:
                scan_text(rel, t, hits, service)
    note = f"{len(unread)} file(s) could not be read" if unread else ""
    r.add("bundle.source_maps", "exposed" if with_src or without else "unknown" if unread else "not_observed",
          "high" if with_src else "medium", with_src + without,
          "source maps with sourcesContent hand out the source: stop shipping them in .next/static",
          f"{len(with_src)} with sources, {len(without)} without" if with_src or without else note)
    r.add("bundle.credentials", "exposed" if hits else "unknown" if unread else "not_observed", "high", hits,
          "rotate the key now, then move it to server code", note)
    r.add("bundle.service_role_jwt", "exposed" if service else "unknown" if unread else "not_observed", "high", service,
          "rotate the Supabase service role key and keep it server-side", note)


def fetch(url, method="GET"):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": "harness-exposure-check"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, {k.lower(): v for k, v in res.headers.items()}, res.read(TEXT_LIMIT)
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, b""


def url_checks(r, base, root):
    base = base.rstrip("/")
    try:
        _, headers, body = fetch(base + "/")
    except (urllib.error.URLError, OSError) as e:
        r.add("deployed.reachable", "unknown", note=f"{base} did not answer: {e}")
        return
    missing = [f"{h} ({why})" for h, why in HEADERS.items() if h not in headers]
    r.add("deployed.security_headers", "exposed" if missing else "not_observed", "medium", missing,
          "set these headers in next.config headers() or the host's config")
    scripts = sorted(set(re.findall(r"""src=["'](/_next/static/[^"']+\.js)["']""", body.decode("utf-8", "replace"))))[:40]
    served, hits, service = [], [], []
    for s in scripts:
        try:
            st, _, js = fetch(base + s)
            if st == 200:
                scan_text(s, js.decode("utf-8", errors="replace"), hits, service)
            if fetch(base + s + ".map", "HEAD")[0] == 200:
                served.append(s + ".map")
        except (urllib.error.URLError, OSError):
            continue
    none = "" if scripts else "no /_next/static script found on /"
    r.add("deployed.source_maps_served", "exposed" if served else "not_observed" if scripts else "unknown", "high",
          served, "stop serving .map files", none)
    r.add("deployed.credentials_in_scripts", "exposed" if hits or service else "not_observed" if scripts else "unknown",
          "high", hits + [f"{x} service_role JWT" for x in service], "rotate the key now, then move it to server code", none)
    routes, dynamic = [], 0
    api = root / "app/api"
    for p in sorted(api.rglob("route.*")) if api.is_dir() else []:
        path = "/" + p.parent.relative_to(root / "app").as_posix()
        if "[" in path:
            dynamic += 1  # a dynamic segment needs a real id
            continue
        try:
            st, hd, b = fetch(base + path)
        except (urllib.error.URLError, OSError):
            continue
        if st == 200 and "json" in hd.get("content-type", "") and b.strip() not in (b"", b"{}", b"[]"):
            routes.append(f"{path} → 200 with data")
    r.add("deployed.api_without_sign_in", "unknown" if routes else "not_observed", None, routes,
          note=("these answer with data to a visitor who is not signed in; check each one should be public. "
                if routes else "") + (f"{dynamic} dynamic route(s) not assessed" if dynamic else ""))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--build", type=Path)
    ap.add_argument("--url")
    ap.add_argument("--fail-on", choices=list(SEVERITY), default="high")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    a = ap.parse_args()
    r = Report()
    repo_checks(r, a.root)
    if a.build:
        build_checks(r, a.build)
    if a.url:
        url_checks(r, a.url, a.root)
    print(json.dumps(r.checks, indent=1) if a.json else r.text())
    return 3 if r.worst() >= SEVERITY[a.fail_on] else 0


if __name__ == "__main__":
    sys.exit(main())
