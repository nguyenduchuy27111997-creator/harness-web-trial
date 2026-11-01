#!/usr/bin/env python3
"""Every table the migrations create in the public schema has row level security enabled.

Supabase exposes the public schema through its API, so a table without RLS can be read
and written by anyone holding the anon key. Run by scripts/check.sh.
"""
import re
import sys
from pathlib import Path

NAME = r'(?:"?public"?\.)?"?(\w+)"?'
CREATE = re.compile(rf"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?{NAME}\s*\(", re.I)
ENABLE = re.compile(rf"\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?{NAME}\s+enable\s+row\s+level\s+security", re.I)
OTHER_SCHEMA = re.compile(r"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?\"?(?!public\b)\w+\"?\.", re.I)


def main(root="."):
    sql = ""
    for path in sorted(Path(root, "supabase/migrations").glob("*.sql")):
        sql += "\n" + re.sub(r"--[^\n]*", "", path.read_text())
    created = {m.group(1).lower() for m in CREATE.finditer(sql)
               if not OTHER_SCHEMA.match(sql, m.start())}
    enabled = {m.group(1).lower() for m in ENABLE.finditer(sql)}
    missing = sorted(created - enabled)
    for table in missing:
        print(f"rls: table public.{table} has no `alter table {table} enable row level security` in supabase/migrations/")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
