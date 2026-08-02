create table if not exists public.user_blocks (
  uid uuid not null references public.profiles(uid) on delete cascade,
  blocked_uid uuid not null references public.profiles(uid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (uid, blocked_uid),
  constraint user_blocks_not_self check (uid <> blocked_uid)
);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_own on public.user_blocks;
create policy user_blocks_own on public.user_blocks
  for all to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_uid);

revoke all on public.user_blocks from anon;
grant select, insert, delete on public.user_blocks to authenticated;

create or replace function public.block_user(target uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  if target = me then raise exception 'Cannot block yourself'; end if;
  if not exists (select 1 from public.profiles p where p.uid = target) then
    raise exception 'No such user';
  end if;
  insert into public.user_blocks (uid, blocked_uid) values (me, target)
  on conflict (uid, blocked_uid) do nothing;
  return true;
end $$;

create or replace function public.unblock_user(target uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  delete from public.user_blocks where uid = me and blocked_uid = target;
  return true;
end $$;

create or replace function public.my_blocks()
returns table (blocked_uid uuid, created_at timestamptz)
language sql security definer set search_path to 'public' stable as $$
  select b.blocked_uid, b.created_at
  from public.user_blocks b
  where b.uid = auth.uid()
  order by b.created_at desc
$$;

create or replace function public.fc_block_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare ctype text; members uuid[]; peer uuid;
begin
  select c.type, c.member_uids into ctype, members from public.chats c where c.id = new.chat_id;
  if ctype is distinct from 'dm' then return new; end if;
  select m into peer from unnest(members) m where m <> new.sender_uid limit 1;
  if peer is null then return new; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.uid = peer and b.blocked_uid = new.sender_uid)
       or (b.uid = new.sender_uid and b.blocked_uid = peer)
  ) then
    raise exception 'FC_BLOCKED';
  end if;
  return new;
end $$;

drop trigger if exists fc_block_guard on public.messages;
create trigger fc_block_guard before insert on public.messages
  for each row execute function public.fc_block_guard();

revoke all on function public.block_user(uuid) from anon;
revoke all on function public.unblock_user(uuid) from anon;
revoke all on function public.my_blocks() from anon;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;
