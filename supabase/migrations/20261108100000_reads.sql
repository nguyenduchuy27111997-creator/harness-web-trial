create table public.reads (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null,
  user_id uuid not null default auth.uid(),
  started_on date,
  finished_on date not null,
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  check (started_on is null or started_on <= finished_on),
  foreign key (book_id, user_id) references public.books (id, user_id) on delete cascade
);

create index reads_book_id_finished_on_idx on public.reads (book_id, finished_on desc);
create index reads_user_id_finished_on_idx on public.reads (user_id, finished_on);

alter table public.reads enable row level security;

create policy reads_select_own on public.reads
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy reads_insert_own on public.reads
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy reads_delete_own on public.reads
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.reads from anon, authenticated;
grant select, insert (book_id, started_on, finished_on, rating), delete on public.reads to authenticated;

create function public.read_again(p_book_id uuid) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  select started_on, finished_on, rating into r
    from public.books
    where id = p_book_id and status = 'finished'
    for update;
  if not found then
    return false;
  end if;
  insert into public.reads (book_id, started_on, finished_on, rating)
    values (p_book_id, r.started_on, r.finished_on, r.rating);
  update public.books
    set status = 'reading',
        rating = null,
        current_page = case when total_pages is null then null else 0 end
    where id = p_book_id;
  return true;
end;
$$;

revoke execute on function public.read_again(uuid) from public, anon;
grant execute on function public.read_again(uuid) to authenticated;
-- rollback: drop function public.read_again(uuid); drop table public.reads;
