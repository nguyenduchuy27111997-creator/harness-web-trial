#!/usr/bin/env python3
"""Turn `supabase ... -o env` output (KEY="value" lines on stdin) into the app's variables.

  supabase status -o env | supabase_env.py local     -> .env.test lines (local stack only)
  supabase branches get X -o env | supabase_env.py branch   -> shell exports for staging

Supabase CLI versions name the same values differently (ANON_KEY or
PUBLISHABLE_KEY, ...), so each target lists the names it accepts, first match
wins. A missing value fails with the names that were offered.
"""
import shlex
import sys

TARGETS = {
    "local": {
        "NEXT_PUBLIC_SUPABASE_URL": ["API_URL", "SUPABASE_URL"],
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": ["ANON_KEY", "PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"],
        "SUPABASE_SERVICE_ROLE_KEY": ["SERVICE_ROLE_KEY", "SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
        "DATABASE_URL": ["DB_URL", "POSTGRES_URL"],
    },
    "branch": {
        "NEXT_PUBLIC_SUPABASE_URL": ["SUPABASE_URL", "API_URL"],
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": ["SUPABASE_ANON_KEY", "ANON_KEY", "SUPABASE_PUBLISHABLE_KEY",
                                          "PUBLISHABLE_KEY"],
        "DATABASE_URL": ["POSTGRES_URL_NON_POOLING", "POSTGRES_URL", "DB_URL"],
    },
}


def parse(text):
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, raw = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        try:
            parts = shlex.split(raw)
        except ValueError:
            parts = [raw]
        values[key] = parts[0] if parts else ""
    return values


def main(target):
    found = parse(sys.stdin.read())
    out, missing = [], []
    for name, candidates in TARGETS[target].items():
        value = next((found[c] for c in candidates if found.get(c)), None)
        if value is None:
            missing.append(f"{name} (looked for {', '.join(candidates)})")
        elif target == "local":
            out.append(f"{name}={value}")
        else:
            out.append(f"export {name}={shlex.quote(value)}")
    if missing:
        sys.stderr.write("supabase_env: missing " + "; ".join(missing)
                         + f". Offered: {', '.join(sorted(found)) or 'nothing'}\n")
        return 1
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "local"))
