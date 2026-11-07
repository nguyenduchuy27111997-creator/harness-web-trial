create table public.notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null,
  user_id uuid not null default auth.uid(),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (book_id, user_id) references public.books (id, user_id) on delete cascade
);

create index notes_book_id_created_at_idx on public.notes (book_id, created_at desc);

alter table public.notes enable row level security;

create policy notes_select_own on public.notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy notes_insert_own on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy notes_update_own on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notes_delete_own on public.notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.notes from anon, authenticated;
grant select, insert (book_id, body), update (body), delete on public.notes to authenticated;
-- rollback: drop table public.notes;
