-- The guard must stop messages FROM a blocked sender TO the person who blocked
-- them, and nothing else. Blocking both directions would also break the
-- blocker's own send path in an existing DM, which looks like a broken client
-- rather than a deliberate block.
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
    where b.uid = peer and b.blocked_uid = new.sender_uid
  ) then
    raise exception 'FC_BLOCKED';
  end if;
  return new;
end $$;
