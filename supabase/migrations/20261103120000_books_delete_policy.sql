create policy books_delete_own on public.books
  for delete to authenticated
  using ((select auth.uid()) = user_id);
-- rollback: drop policy books_delete_own on public.books;
