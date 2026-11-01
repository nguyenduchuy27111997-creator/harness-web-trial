-- rollback: drop table public.books;
create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  author text not null check (char_length(author) between 1 and 120),
  status text not null default 'want_to_read' check (status in ('want_to_read', 'reading', 'finished')),
  created_at timestamptz not null default now()
);

create index books_user_id_created_at_idx on public.books (user_id, created_at desc);

alter table public.books enable row level security;

create policy books_select_own on public.books
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy books_insert_own on public.books
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
