-- PR-2: per-user chat flags + cheap chat previews
--
-- Before this migration:
--   * chats.pinned / chats.muted were columns on the shared chat row, so one
--     member pinning a chat pinned it for everyone.
--   * the client called listMessages() for every chat on every incoming
--     message (20 chats x 500 messages = ~10 000 rows per "привет").

-- ── per-user pinned / muted ────────────────────────────────────────────
create table if not exists public.chat_prefs (
  uid uuid not null references public.profiles(uid) on delete cascade,
  chat_id text not null references public.chats(id) on delete cascade,
  pinned boolean not null default false,
  muted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (uid, chat_id)
);

alter table public.chat_prefs enable row level security;

drop policy if exists chat_prefs_own on public.chat_prefs;
create policy chat_prefs_own on public.chat_prefs
  for all to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- carry the old global flags over so nobody loses their current state
insert into public.chat_prefs (uid, chat_id, pinned, muted)
select m.uid, c.id, coalesce(c.pinned, false), coalesce(c.muted, false)
from public.chats c
cross join lateral unnest(coalesce(c.member_uids, '{}'::uuid[])) as m(uid)
where coalesce(c.pinned, false) or coalesce(c.muted, false)
on conflict (uid, chat_id) do nothing;

-- ── list_my_chats now returns the caller's own flags ────────────────────────
create or replace function public.list_my_chats()
returns setof public.chats
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.type, c.title, c.username, c.emoji, c.color, c.description,
         c.member_uids, c.admin_uids, c.owner_uid, c.verified, c.member_count,
         c.created_at, c.avatar_url, c.is_private, c.invite_code,
         coalesce(p.pinned, false) as pinned,
         coalesce(p.muted, false)  as muted
  from public.chats c
  left join public.chat_prefs p on p.chat_id = c.id and p.uid = auth.uid()
  where auth.uid() = any(c.member_uids)
     or (c.type = 'saved' and c.owner_uid = auth.uid())
  order by coalesce(p.pinned, false) desc,
           coalesce((select max(m.ts) from public.messages m where m.chat_id = c.id), c.created_at) desc
$$;

-- ── set_chat_flags writes the caller's own row, not the shared chat ──────────
create or replace function public.set_chat_flags(
  chat text,
  want_pinned boolean default null,
  want_muted boolean default null
)
returns public.chats
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  ch public.chats;
  pref public.chat_prefs;
begin
  if me is null then raise exception 'Authentication required'; end if;
  select * into ch from public.chats where id = chat;
  if not found then raise exception 'Chat not found'; end if;
  if not (me = any(ch.member_uids)) then raise exception 'Not a member'; end if;

  insert into public.chat_prefs (uid, chat_id, pinned, muted)
  values (me, chat, coalesce(want_pinned, false), coalesce(want_muted, false))
  on conflict (uid, chat_id) do update
    set pinned = coalesce(want_pinned, public.chat_prefs.pinned),
        muted  = coalesce(want_muted,  public.chat_prefs.muted),
        updated_at = now()
  returning * into pref;

  ch.pinned := pref.pinned;
  ch.muted  := pref.muted;
  return ch;
end $$;

-- ── one round-trip previews instead of downloading every chat's history ────
create or replace function public.chat_previews()
returns table (
  chat_id text,
  id uuid,
  sender_uid uuid,
  text text,
  ts timestamptz,
  sticker text,
  attachment jsonb,
  deleted boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct on (m.chat_id)
         m.chat_id, m.id, m.sender_uid, m.text, m.ts, m.sticker, m.attachment, m.deleted
  from public.messages m
  join public.chats c on c.id = m.chat_id
  where auth.uid() = any(c.member_uids)
     or (c.type = 'saved' and c.owner_uid = auth.uid())
  order by m.chat_id, m.ts desc
$$;

grant execute on function public.chat_previews() to authenticated;

-- ── pagination / preview index ──────────────────────────────────────────
create index if not exists messages_chat_ts_idx on public.messages (chat_id, ts desc);
