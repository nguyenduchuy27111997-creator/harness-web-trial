-- rollback: revoke update (total_pages, current_page) on public.books from authenticated; alter table public.books drop constraint books_progress_pair, drop column current_page, drop column total_pages;
alter table public.books
  add column total_pages smallint check (total_pages between 1 and 10000),
  add column current_page smallint check (current_page >= 0),
  add constraint books_progress_pair check (
    (total_pages is null) = (current_page is null) and (current_page is null or current_page <= total_pages)
  );

grant update (total_pages, current_page) on public.books to authenticated;
