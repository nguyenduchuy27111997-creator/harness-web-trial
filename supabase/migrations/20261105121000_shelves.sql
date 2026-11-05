create table public.shelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create unique index shelves_user_id_lower_name_key on public.shelves (user_id, lower(name));

alter table public.shelves enable row level security;

create policy shelves_select_own on public.shelves
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy shelves_insert_own on public.shelves
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy shelves_update_own on public.shelves
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy shelves_delete_own on public.shelves
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.shelves from anon, authenticated;
grant select, insert (name), update (name), delete on public.shelves to authenticated;
-- rollback: drop table public.shelves;
