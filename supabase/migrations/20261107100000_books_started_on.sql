-- rollback: drop trigger books_set_started_on on public.books; drop function public.books_set_started_on(); revoke update (started_on, finished_on) on public.books from authenticated; alter table public.books drop constraint books_started_before_finished, drop constraint books_started_on_status, drop column started_on;
alter table public.books add column started_on date;

alter table public.books
  add constraint books_started_on_status check (status <> 'want_to_read' or started_on is null),
  add constraint books_started_before_finished check (started_on is null or finished_on is null or started_on <= finished_on);

create function public.books_set_started_on() returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if new.status = 'reading' then
    if tg_op = 'INSERT' or old.status <> 'reading' then
      new.started_on = (now() at time zone 'utc')::date;
    end if;
  elsif new.status = 'want_to_read' then
    new.started_on = null;
  elsif tg_op = 'INSERT' then
    new.started_on = null;
  end if;
  return new;
end;
$$;

create trigger books_set_started_on
  before insert or update of status on public.books
  for each row execute function public.books_set_started_on();

grant update (started_on, finished_on) on public.books to authenticated;
