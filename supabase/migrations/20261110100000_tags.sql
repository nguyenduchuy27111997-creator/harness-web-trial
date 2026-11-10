-- rollback: drop function public.import_books(jsonb); drop table public.book_tags; drop table public.tags;
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index tags_user_id_lower_name_key on public.tags (user_id, lower(name));

alter table public.tags enable row level security;

create policy tags_select_own on public.tags
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy tags_insert_own on public.tags
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy tags_update_own on public.tags
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy tags_delete_own on public.tags
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.tags from anon, authenticated;
grant select, insert (name), update (name), delete on public.tags to authenticated;

create table public.book_tags (
  book_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (book_id, tag_id),
  foreign key (book_id, user_id) references public.books (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create index book_tags_tag_id_idx on public.book_tags (tag_id);

alter table public.book_tags enable row level security;

create policy book_tags_select_own on public.book_tags
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy book_tags_insert_own on public.book_tags
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy book_tags_delete_own on public.book_tags
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.book_tags from anon, authenticated;
grant select, insert (book_id, tag_id), delete on public.book_tags to authenticated;

-- Imports validated rows in one transaction; the insert triggers set today's dates, then the file's dates replace them.
create function public.import_books(p_rows jsonb) returns integer
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  r jsonb;
  new_id uuid;
  pages smallint;
  n integer := 0;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    pages := (r ->> 'total_pages')::smallint;
    insert into public.books (title, author, status, rating, total_pages, current_page)
    values (
      r ->> 'title',
      r ->> 'author',
      r ->> 'status',
      (r ->> 'rating')::smallint,
      pages,
      case when pages is null then null when r ->> 'status' = 'finished' then pages else 0 end
    )
    returning id into new_id;
    if r ->> 'started_on' is not null or r ->> 'finished_on' is not null then
      update public.books
      set started_on = coalesce((r ->> 'started_on')::date, started_on),
          finished_on = coalesce((r ->> 'finished_on')::date, finished_on)
      where id = new_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.import_books(jsonb) from public, anon;
grant execute on function public.import_books(jsonb) to authenticated;
