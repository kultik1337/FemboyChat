-- Invites with limits. The old scheme was one eternal code per chat living in
-- chats.invite_code: it could be copied on, never expired and could only be
-- "revoked" by replacing it for everyone at once. Codes now live in their own
-- table with a use counter and an expiry; the legacy column stays valid so no
-- link that is already in someone's messages suddenly breaks.

create table if not exists public.chat_invites (
  code text primary key,
  chat_id text not null references public.chats(id) on delete cascade,
  created_by uuid not null,
  label text,
  max_uses int,
  uses int not null default 0,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_invites_chat_idx on public.chat_invites (chat_id);

alter table public.chat_invites enable row level security;

-- Reading the list of codes is an admin action; joining does not read the
-- table directly, it goes through the security-definer function below.
drop policy if exists chat_invites_select on public.chat_invites;
create policy chat_invites_select on public.chat_invites
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.chats c
      where c.id = chat_invites.chat_id
        and (c.owner_uid = auth.uid() or auth.uid() = any(c.admin_uids))
    )
  );

create or replace function public.fc_can_manage_chat(p_chat text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat
      and (c.owner_uid = auth.uid() or auth.uid() = any(c.admin_uids))
  );
$$;

create or replace function public.create_chat_invite(
  p_chat text,
  p_max_uses int default null,
  p_ttl_hours int default null,
  p_label text default null
)
returns public.chat_invites
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); row public.chat_invites; new_code text;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if not public.fc_can_manage_chat(p_chat) then
    raise exception 'Только админ чата может создавать приглашения';
  end if;
  new_code := replace(gen_random_uuid()::text, '-', '');
  new_code := substr(new_code, 1, 12);
  insert into public.chat_invites (code, chat_id, created_by, label, max_uses, expires_at)
  values (
    new_code,
    p_chat,
    me,
    nullif(btrim(coalesce(p_label, '')), ''),
    case when coalesce(p_max_uses, 0) > 0 then p_max_uses else null end,
    case when coalesce(p_ttl_hours, 0) > 0 then now() + make_interval(hours => p_ttl_hours) else null end
  )
  returning * into row;
  return row;
end $$;

create or replace function public.list_chat_invites(p_chat text)
returns setof public.chat_invites
language sql
security definer
set search_path = public
stable
as $$
  select * from public.chat_invites
  where chat_id = p_chat and public.fc_can_manage_chat(p_chat)
  order by revoked, created_at desc;
$$;

create or replace function public.revoke_chat_invite(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare row public.chat_invites;
begin
  select * into row from public.chat_invites where code = p_code;
  if not found then return false; end if;
  if not public.fc_can_manage_chat(row.chat_id) then
    raise exception 'Только админ чата может отзывать приглашения';
  end if;
  update public.chat_invites set revoked = true where code = p_code;
  return true;
end $$;

-- Joining: new codes first, then the legacy per-chat column.
create or replace function public.join_by_invite(code text)
returns public.chats
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); inv public.chat_invites; ch public.chats;
begin
  if me is null then raise exception 'Authentication required'; end if;

  select * into inv from public.chat_invites where chat_invites.code = join_by_invite.code;
  if found then
    if inv.revoked then raise exception 'Приглашение отозвано'; end if;
    if inv.expires_at is not null and inv.expires_at < now() then
      raise exception 'Срок действия приглашения истёк';
    end if;
    if inv.max_uses is not null and inv.uses >= inv.max_uses then
      raise exception 'Приглашение уже использовано';
    end if;

    select * into ch from public.chats where id = inv.chat_id and type in ('group', 'channel');
    if not found then raise exception 'Приглашение недействительно или отозвано'; end if;

    if not (me = any(ch.member_uids)) then
      update public.chats
        set member_uids = array_append(member_uids, me),
            member_count = coalesce(member_count, 0) + 1
        where id = ch.id returning * into ch;
      -- A member who is already inside does not burn a use: re-opening your
      -- own link should not quietly consume the last slot.
      update public.chat_invites set uses = uses + 1 where chat_invites.code = join_by_invite.code;
    end if;
    return ch;
  end if;

  select * into ch from public.chats where invite_code = join_by_invite.code and type in ('group', 'channel');
  if not found then raise exception 'Приглашение недействительно или отозвано'; end if;
  if not (me = any(ch.member_uids)) then
    update public.chats set member_uids = array_append(member_uids, me), member_count = coalesce(member_count, 0) + 1
      where id = ch.id returning * into ch;
  end if;
  return ch;
end $$;

revoke all on function public.create_chat_invite(text, int, int, text) from public;
revoke all on function public.list_chat_invites(text) from public;
revoke all on function public.revoke_chat_invite(text) from public;
grant execute on function public.create_chat_invite(text, int, int, text) to authenticated;
grant execute on function public.list_chat_invites(text) to authenticated;
grant execute on function public.revoke_chat_invite(text) to authenticated;
