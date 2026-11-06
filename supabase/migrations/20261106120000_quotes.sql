create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null,
  user_id uuid not null default auth.uid(),
  body text not null check (char_length(body) between 1 and 1000),
  page smallint check (page between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key (book_id, user_id) references public.books (id, user_id) on delete cascade
);

create index quotes_book_id_created_at_idx on public.quotes (book_id, created_at desc);
create index quotes_user_id_created_at_idx on public.quotes (user_id, created_at desc);

alter table public.quotes enable row level security;

create policy quotes_select_own on public.quotes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy quotes_insert_own on public.quotes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy quotes_update_own on public.quotes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy quotes_delete_own on public.quotes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.quotes from anon, authenticated;
grant select, insert (book_id, body, page), update (body, page), delete on public.quotes to authenticated;
-- rollback: drop table public.quotes;
