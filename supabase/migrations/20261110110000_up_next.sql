-- rollback: drop function public.move_up_next(uuid, boolean); drop table public.up_next; drop function public.up_next_before_insert();
create table public.up_next (
  book_id uuid primary key,
  user_id uuid not null default auth.uid(),
  position integer not null,
  created_at timestamptz not null default now(),
  foreign key (book_id, user_id) references public.books (id, user_id) on delete cascade
);

create index up_next_user_id_position_idx on public.up_next (user_id, position);

alter table public.up_next enable row level security;

create policy up_next_select_own on public.up_next
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy up_next_insert_own on public.up_next
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy up_next_update_own on public.up_next
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy up_next_delete_own on public.up_next
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.up_next from anon, authenticated;
grant select, insert (book_id), update (position), delete on public.up_next to authenticated;

-- Only a Want to read book is queued, at the end of the queue.
create function public.up_next_before_insert() returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.books b where b.id = new.book_id and b.status = 'want_to_read') then
    raise exception 'book % is not want to read', new.book_id using errcode = 'check_violation';
  end if;
  new.position := coalesce((select max(q.position) from public.up_next q where q.user_id = new.user_id), 0) + 1;
  return new;
end;
$$;

create trigger up_next_before_insert
  before insert on public.up_next
  for each row execute function public.up_next_before_insert();

-- Swaps a queued book with its neighbour above (p_up) or below; books no longer Want to read are passed over.
create function public.move_up_next(p_book_id uuid, p_up boolean) returns boolean
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  cur public.up_next;
  other public.up_next;
begin
  select q.* into cur from public.up_next q where q.book_id = p_book_id for update;
  if not found then
    return false;
  end if;
  if p_up then
    select q.* into other from public.up_next q
    where (q.position, q.created_at, q.book_id) < (cur.position, cur.created_at, cur.book_id)
      and exists (select 1 from public.books b where b.id = q.book_id and b.status = 'want_to_read')
    order by q.position desc, q.created_at desc, q.book_id desc
    limit 1 for update;
  else
    select q.* into other from public.up_next q
    where (q.position, q.created_at, q.book_id) > (cur.position, cur.created_at, cur.book_id)
      and exists (select 1 from public.books b where b.id = q.book_id and b.status = 'want_to_read')
    order by q.position, q.created_at, q.book_id
    limit 1 for update;
  end if;
  if not found then
    return false;
  end if;
  if other.position = cur.position then
    -- Equal positions (a concurrent insert): separate them so the order changes.
    update public.up_next set position = cur.position + (case when p_up then 1 else -1 end) where book_id = other.book_id;
  else
    update public.up_next set position = other.position where book_id = cur.book_id;
    update public.up_next set position = cur.position where book_id = other.book_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.move_up_next(uuid, boolean) from public, anon;
grant execute on function public.move_up_next(uuid, boolean) to authenticated;
