---
name: migrations-land-with-design
description: Milestone migrations (e.g. M8 shelf_shares) are committed on main with /design, so `git diff main` on a feature branch shows no SQL
metadata:
  type: project
---

On F083 (2026-11-14), `supabase/migrations/20261114110000_shelf_shares.sql` was already on main (added by the M8 design commit), so `git diff main -- supabase/` was empty.

**Why:** an empty diff can look like "the feature has no migration" when it does.
**How to apply:** for DB/RLS criteria, read the milestone's migrations in `supabase/migrations/` directly and `git log` them, rather than relying on the branch diff. Anon REST probes with .env keys are denied; see [[rls-probe-via-test]].
