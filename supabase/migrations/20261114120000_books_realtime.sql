-- rollback: drop trigger books_broadcast on public.books; drop function public.books_broadcast(); drop policy books_topic_owner_receives on realtime.messages;
-- Live list (docs/design/M8.md): every change to a book is broadcast on the owner's private topic 'books:<user_id>'.
create function public.books_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'books:' || coalesce(new.user_id, old.user_id)::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;
revoke execute on function public.books_broadcast() from public, anon, authenticated;
create trigger books_broadcast after insert or update or delete on public.books
  for each row execute function public.books_broadcast();

-- Only the owner may join (and so receive) their private books topic.
create policy books_topic_owner_receives on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = 'books:' || (select auth.uid())::text);
