-- Applied on the hosted project as four migrations:
--   fix_invite_code_generation
--   changelog_autojoin_and_presence_privacy
--   channel_views_comments_single_reaction
-- Everything here is create-or-replace / if-not-exists, so it is safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Invite codes: gen_random_bytes lives in the `extensions` schema, but this
--    trigger pins search_path to `public`, so EVERY group/channel INSERT failed.
-- ---------------------------------------------------------------------------
create or replace function public.fc_group_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare kis uuid := '00000000-0000-4000-8000-000000000003';
begin
  if NEW.type in ('group', 'channel') then
    if NEW.owner_uid is not null and not (NEW.owner_uid = any(coalesce(NEW.member_uids, '{}'))) then
      NEW.member_uids := array_append(coalesce(NEW.member_uids, '{}'), NEW.owner_uid);
    end if;
    if NEW.owner_uid is not null and not (NEW.owner_uid = any(coalesce(NEW.admin_uids, '{}'))) then
      NEW.admin_uids := array_append(coalesce(NEW.admin_uids, '{}'), NEW.owner_uid);
    end if;
    if NEW.type = 'group' and not (kis = any(coalesce(NEW.member_uids, '{}'))) then
      NEW.member_uids := array_append(coalesce(NEW.member_uids, '{}'), kis);
    end if;
    NEW.member_count := coalesce(array_length(NEW.member_uids, 1), 0);
    if NEW.username is null or NEW.username = '' then
      NEW.is_private := true;
    end if;
    if NEW.invite_code is null then
      -- pgcrypto-free, schema-independent
      NEW.invite_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    end if;
  end if;
  return NEW;
end $function$;

-- ---------------------------------------------------------------------------
-- 2. Presence privacy. `profiles.settings.privacy.lastSeen` is one of:
--    'everyone' (default) | 'contacts' | 'nobody'
--    'nobody'   -> never online, never a last-seen time
--    'contacts' -> online dot only, no last-seen time
-- ---------------------------------------------------------------------------
drop view if exists public.directory;
create view public.directory as
  select
    p.uid::text as id,
    case when coalesce(p.is_bot, false) then 'bot' else 'user' end as kind,
    p.num_id, p.username, p.name, p.emoji, p.color, p.bio, p.verified,
    null::int as members,
    case when coalesce(p.settings #>> '{privacy,lastSeen}', 'everyone') = 'nobody'
      then false else p.last_seen > now() - interval '5 minutes' end as online,
    case when coalesce(p.settings #>> '{privacy,lastSeen}', 'everyone') = 'everyone'
      then p.last_seen else null::timestamptz end as last_seen,
    p.avatar_url
  from public.profiles p
  union all
  select
    c.id, c.type as kind, null::bigint, c.username, c.title, c.emoji, c.color,
    c.description, c.verified, c.member_count, null::boolean, null::timestamptz, c.avatar_url
  from public.chats c
  where c.type in ('group', 'channel') and coalesce(c.is_private, false) = false;

alter view public.directory set (security_invoker = false);
grant select on public.directory to anon, authenticated;

create or replace function public.peer_presence(uids uuid[])
returns table (uid uuid, online boolean, last_seen timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select p.uid,
    case when coalesce(p.settings #>> '{privacy,lastSeen}', 'everyone') = 'nobody'
      then false else p.last_seen > now() - interval '5 minutes' end,
    case when coalesce(p.settings #>> '{privacy,lastSeen}', 'everyone') = 'everyone'
      then p.last_seen else null::timestamptz end
  from public.profiles p where p.uid = any(uids)
$$;
revoke execute on function public.peer_presence(uuid[]) from anon, public;
grant execute on function public.peer_presence(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Channel posts: view counters and comment threads.
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists comment_of uuid references public.messages(id) on delete cascade,
  add column if not exists view_count int not null default 0,
  add column if not exists comment_count int not null default 0;

create index if not exists messages_comment_of_idx on public.messages (comment_of, ts);

create table if not exists public.message_views (
  message_id uuid not null references public.messages(id) on delete cascade,
  uid uuid not null references public.profiles(uid) on delete cascade,
  ts timestamptz not null default now(),
  primary key (message_id, uid)
);
alter table public.message_views enable row level security;
drop policy if exists message_views_own on public.message_views;
create policy message_views_own on public.message_views
  for all to authenticated using (uid = auth.uid()) with check (uid = auth.uid());

create or replace function public.mark_viewed(msg_ids uuid[])
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  with ins as (
    insert into public.message_views (message_id, uid)
    select m.id, me from public.messages m
    where m.id = any(msg_ids)
      and exists (select 1 from public.chats c where c.id = m.chat_id and me = any(c.member_uids))
    on conflict do nothing
    returning message_id
  )
  update public.messages m set view_count = m.view_count + 1
    where m.id in (select message_id from ins);
end $function$;
revoke execute on function public.mark_viewed(uuid[]) from anon, public;
grant execute on function public.mark_viewed(uuid[]) to authenticated;

create or replace function public.fc_sync_comment_count()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if TG_OP = 'INSERT' and NEW.comment_of is not null then
    update public.messages set comment_count = comment_count + 1 where id = NEW.comment_of;
  elsif TG_OP = 'DELETE' and OLD.comment_of is not null then
    update public.messages set comment_count = greatest(0, comment_count - 1) where id = OLD.comment_of;
  end if;
  return null;
end $function$;

drop trigger if exists fc_comment_count on public.messages;
create trigger fc_comment_count after insert or delete on public.messages
  for each row execute function public.fc_sync_comment_count();

-- ---------------------------------------------------------------------------
-- 4. One reaction per person per message: a new emoji moves your vote,
--    tapping the same emoji again removes it.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_reaction(message uuid, emoji text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare me text := auth.uid()::text; arr jsonb; el jsonb; uids jsonb;
        newarr jsonb := '[]'::jsonb; same boolean := false;
begin
  select coalesce(reactions, '[]'::jsonb) into arr from public.messages where id = message;
  for el in select * from jsonb_array_elements(arr) loop
    uids := el->'uids';
    if uids @> to_jsonb(array[me]) then
      if el->>'emoji' = emoji then same := true; end if;
      uids := (select coalesce(jsonb_agg(u), '[]'::jsonb)
               from jsonb_array_elements_text(uids) u where u <> me);
    end if;
    if jsonb_array_length(uids) > 0 then
      newarr := newarr || jsonb_build_object('emoji', el->>'emoji', 'uids', uids);
    end if;
  end loop;
  if not same then
    if exists (select 1 from jsonb_array_elements(newarr) e where e->>'emoji' = emoji) then
      newarr := (select jsonb_agg(case when e->>'emoji' = emoji
                   then jsonb_build_object('emoji', emoji, 'uids', (e->'uids') || to_jsonb(array[me]))
                   else e end)
                 from jsonb_array_elements(newarr) e);
    else
      newarr := newarr || jsonb_build_object('emoji', emoji, 'uids', to_jsonb(array[me]));
    end if;
  end if;
  update public.messages set reactions = coalesce(newarr, '[]'::jsonb) where id = message;
end $function$;

-- ---------------------------------------------------------------------------
-- 5. Everyone joins the changelog channel on sign-up.
-- ---------------------------------------------------------------------------
create or replace function public.fc_onboard_profile()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare fem uuid := '00000000-0000-4000-8000-000000000002'; did text;
begin
  if NEW.is_bot then return NEW; end if;

  insert into public.chats (id, type, title, emoji, color, member_uids, admin_uids, owner_uid)
  values ('saved-' || NEW.uid::text, 'saved', 'Избранное', '🔖', '#7cc4ff',
          array[NEW.uid], array[NEW.uid], NEW.uid)
  on conflict (id) do nothing;

  did := 'dm-' || (select string_agg(x, '~') from (select unnest(array[NEW.uid::text, fem::text]) as x order by x) s);
  insert into public.chats (id, type, title, emoji, color, member_uids, admin_uids)
  values (did, 'bot', 'FemboyAI', '🎀', '#ff7ab8', array[NEW.uid, fem], '{}')
  on conflict (id) do nothing;
  insert into public.messages (chat_id, sender_uid, text)
  select did, fem,
    'Приветик, ' || NEW.name || '! 🎀 Я FemboyAI — твой ласковый ути-пути фембойчик. Твой номер аккаунта #' || NEW.num_id || '. Напиши мне что угодно, уии~ 💗'
  where not exists (select 1 from public.messages where chat_id = did);

  update public.chats
    set member_uids = array_append(member_uids, NEW.uid),
        member_count = coalesce(member_count, 0) + 1
    where id in ('chan-news', 'grp-lounge', 'chan-changelog')
      and not (NEW.uid = any(member_uids));

  return NEW;
end $function$;
