create table public.reading_goals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year smallint not null check (year between 2000 and 9999),
  goal smallint not null check (goal between 1 and 365),
  created_at timestamptz not null default now(),
  primary key (user_id, year)
);

alter table public.reading_goals enable row level security;

create policy reading_goals_select_own on public.reading_goals
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy reading_goals_insert_own on public.reading_goals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy reading_goals_update_own on public.reading_goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.reading_goals from anon, authenticated;
grant select, insert (year, goal), update (year, goal) on public.reading_goals to authenticated;
-- rollback: drop table public.reading_goals;
