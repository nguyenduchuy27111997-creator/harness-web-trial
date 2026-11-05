alter table public.books add constraint books_id_user_id_key unique (id, user_id);
alter table public.shelves add constraint shelves_id_user_id_key unique (id, user_id);

create table public.book_shelves (
  book_id uuid not null,
  shelf_id uuid not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (shelf_id, book_id),
  foreign key (book_id, user_id) references public.books (id, user_id) on delete cascade,
  foreign key (shelf_id, user_id) references public.shelves (id, user_id) on delete cascade
);

create index book_shelves_book_id_idx on public.book_shelves (book_id);

alter table public.book_shelves enable row level security;

create policy book_shelves_select_own on public.book_shelves
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy book_shelves_insert_own on public.book_shelves
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy book_shelves_delete_own on public.book_shelves
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.book_shelves from anon, authenticated;
grant select, insert (book_id, shelf_id), delete on public.book_shelves to authenticated;
-- rollback: drop table public.book_shelves; alter table public.shelves drop constraint shelves_id_user_id_key; alter table public.books drop constraint books_id_user_id_key;
