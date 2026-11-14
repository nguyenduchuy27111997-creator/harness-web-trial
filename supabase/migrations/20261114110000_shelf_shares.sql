-- rollback: drop policy covers_anon_sign_shared on storage.objects; drop function public.cover_is_shared(text); drop function public.shared_shelf(text); drop table public.shelf_shares;
-- A shelf's share link (docs/design/M8.md). Stop sharing deletes the row; sharing again makes a new token.
create table public.shelf_shares (
  shelf_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  foreign key (shelf_id, user_id) references public.shelves (id, user_id) on delete cascade
);
alter table public.shelf_shares enable row level security;
create policy shelf_shares_select_own on public.shelf_shares for select to authenticated using ((select auth.uid()) = user_id);
create policy shelf_shares_insert_own on public.shelf_shares for insert to authenticated with check ((select auth.uid()) = user_id);
create policy shelf_shares_delete_own on public.shelf_shares for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.shelf_shares from anon, authenticated;
grant select, insert (shelf_id), delete on public.shelf_shares to authenticated;

-- The only anonymous read path: the shared shelf's name and, per book, only the allowed columns.
-- One row per book; one row with null book columns when the shelf has no books; no rows for an unknown token.
create function public.shared_shelf(p_token text)
returns table (shelf_name text, book_id uuid, title text, author text, status text, rating smallint, cover_path text, added_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, b.id, b.title, b.author, b.status::text, b.rating, b.cover_path, bs.created_at
  from public.shelf_shares ss
  join public.shelves s on s.id = ss.shelf_id and s.user_id = ss.user_id
  left join public.book_shelves bs on bs.shelf_id = s.id
  left join public.books b on b.id = bs.book_id and b.user_id = s.user_id
  where ss.token = p_token
  order by bs.created_at desc nulls last, b.id;
$$;
revoke execute on function public.shared_shelf(text) from public;
grant execute on function public.shared_shelf(text) to anon, authenticated;

-- True when the object is the current cover of a book on a shared shelf. Used only by the anon storage policy below.
create function public.cover_is_shared(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.books b
    join public.book_shelves bs on bs.book_id = b.id
    join public.shelf_shares ss on ss.shelf_id = bs.shelf_id
    where b.cover_path = p_name
  );
$$;
revoke execute on function public.cover_is_shared(text) from public;
grant execute on function public.cover_is_shared(text) to anon;

-- Anonymous visitors may sign a shared cover's URL (storage operations object.sign and object.sign_many), never list or download directly.
drop policy if exists covers_anon_sign_shared on storage.objects;
create policy covers_anon_sign_shared on storage.objects for select to anon
  using (
    bucket_id = 'covers'
    and storage.allow_any_operation(array['object.sign', 'object.sign_many'])
    and public.cover_is_shared(name)
  );
