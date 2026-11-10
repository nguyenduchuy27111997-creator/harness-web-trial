# 0017: Account deletion through a security definer function

- Date: 2026-11-10
- Status: proposed (waiting for a human; F074 is blocked until it is accepted)

## Context
F074 deletes the account with all its data. The authenticated role cannot touch `auth.users`. `scripts/migration-lint.py` treats any `delete from` in a migration as destructive, including one inside a function body. It needs a decision that a human approved.

## Decision
F074 adds the migration `<timestamp>_delete_account.sql`. It creates `public.delete_account()` (`security definer`, `set search_path = ''`, body `delete from auth.users where id = auth.uid();`), and only `authenticated` may execute it. The migration carries `-- destructive-approved: docs/decisions/0017-account-delete-function.md`. The migration itself deletes no rows. The function deletes only the caller's own user, and every user table cascades from it (docs/design/M7.md, Data model).

Rejected: calling `auth.admin.deleteUser` with the service-role key from the app server. The app would then hold a key that bypasses all RLS.

## Consequences
- A human changes Status to accepted (or picks the admin-API alternative) before F074 runs.
- Until then, F074 is `needs_human` with this file as the reason.
