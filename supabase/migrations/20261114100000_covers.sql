-- rollback: drop policy covers_owner_select on storage.objects; drop policy covers_owner_insert on storage.objects; drop policy covers_owner_update on storage.objects; drop policy covers_owner_delete on storage.objects; revoke update (cover_path) on public.books from authenticated; alter table public.books drop constraint books_cover_path_own, drop column cover_path; -- the bucket is removed with the Storage API
-- A book's cover: one object in the private 'covers' bucket at '<user_id>/<book_id>-<random>.<ext>' (docs/design/M8.md).
alter table public.books add column cover_path text;
alter table public.books add constraint books_cover_path_own
  check (cover_path is null or (char_length(cover_path) <= 200 and starts_with(cover_path, user_id::text || '/' || id::text || '-')));
grant update (cover_path) on public.books to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Idempotent (drop policy if exists): the shared local stack may already hold these policies, and the types check dumps them into its scratch database.
-- The owner reads, writes and deletes only objects under their own folder; an upload must name one of their books.
drop policy if exists covers_owner_select on storage.objects;
create policy covers_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists covers_owner_insert on storage.objects;
create policy covers_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.books b
      where b.user_id = (select auth.uid())
        and starts_with(storage.filename(name), b.id::text || '-')
    )
  );
drop policy if exists covers_owner_update on storage.objects;
create policy covers_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists covers_owner_delete on storage.objects;
create policy covers_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
