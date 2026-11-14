---
name: shared-db-migration-check
description: The local Supabase stack is shared across worktrees; a branch's migration may not be applied there, so validate migration files with scripts/db-types.sh --check
metadata:
  type: project
---

On F081 (2026-11-14) the shared DB (supabase_db_harness-web-trial, port 56322) had storage policies named `covers_owner_*_local` and no `20261114100000` row in supabase_migrations.schema_migrations: the branch's migration file was not what was live.

**Why:** every worktree/loop lane shares one stack; policies get applied by hand or by other branches.
**How to apply:** when a criterion depends on a migration file's content, run `scripts/db-types.sh --check` (replays the branch's migrations into a scratch DB; read-only for the repo). An "ERROR: relation public.books does not exist" in its output comes from the pg_dump step, not a migration. Behaviour probes still go against the live stack. See [[storage-service-role-listing]].
