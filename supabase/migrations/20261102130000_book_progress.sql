-- rollback: drop trigger books_set_finished_on on public.books; drop function public.books_set_finished_on(); drop policy books_update_own on public.books; grant update on public.books to authenticated, anon; alter table public.books drop constraint books_finished_on_matches_status, drop column review, drop column rating, drop column finished_on;
alter table public.books
  add column finished_on date,
  add column rating smallint check (rating between 1 and 5),
  add column review text check (char_length(review) <= 2000);

update public.books set finished_on = (created_at at time zone 'utc')::date where status = 'finished';

alter table public.books
  add constraint books_finished_on_matches_status check ((status = 'finished') = (finished_on is not null));

create function public.books_set_finished_on() returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if new.status = 'finished' then
    if tg_op = 'INSERT' or old.status <> 'finished' then
      new.finished_on = (now() at time zone 'utc')::date;
    end if;
  else
    new.finished_on = null;
  end if;
  return new;
end;
$$;

create trigger books_set_finished_on
  before insert or update of status on public.books
  for each row execute function public.books_set_finished_on();

create policy books_update_own on public.books
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke update on public.books from authenticated, anon;
grant update (status, rating, review) on public.books to authenticated;
