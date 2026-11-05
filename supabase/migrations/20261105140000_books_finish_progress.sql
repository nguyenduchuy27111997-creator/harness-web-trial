-- rollback: drop trigger books_finish_progress on public.books; drop function public.books_finish_progress();
create function public.books_finish_progress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'finished' and old.status <> 'finished' and new.total_pages is not null then
    new.current_page = new.total_pages;
  end if;
  return new;
end;
$$;

create trigger books_finish_progress
  before update of status on public.books
  for each row execute function public.books_finish_progress();
