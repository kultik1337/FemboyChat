-- REGRESSION FIX for 20260729030000.
--
-- That migration rebuilt public.directory and renamed its first column from
-- `uid` to `id`. src/components/app/people.ts resolves identities with
--
--     directory.find((x) => x.uid === uid)
--
-- so every lookup missed and fell through to the placeholder
-- { name: 'Кто-то', username: '' } — every person in the app turned into
-- "Кто-то" and all usernames disappeared.
--
-- Rule learned: public.directory is a client-facing contract. Column NAMES and
-- ORDER must match supabase/schema.sql exactly; new fields may only be APPENDED.

drop view if exists public.directory;
create view public.directory as
  select p.uid::text as uid,
         (case when p.is_bot then 'bot' else 'user' end) as kind,
         p.num_id::bigint as num_id,
         p.username,
         p.name,
         p.emoji,
         p.color,
         coalesce(p.bio, '') as bio,
         p.verified,
         null::int as members,
         -- privacy.lastSeen: 'everyone' (default) | 'contacts' | 'nobody'
         (case when coalesce(p.settings #>> '{privacy,lastSeen}', 'everyone') = 'nobody'
            then false
            else p.last_seen > now() - interval '5 minutes'
          end) as online,
         p.avatar_url,
         (case when coalesce(p.settings #>> '{privacy,lastSeen}', 'everyone') = 'everyone'
            then p.last_seen
            else null::timestamptz
          end) as last_seen
  from public.profiles p
  union all
  select c.id as uid,
         c.type as kind,
         0::bigint as num_id,
         coalesce(c.username, '') as username,
         c.title as name,
         c.emoji,
         c.color,
         coalesce(c.description, '') as bio,
         c.verified,
         c.member_count as members,
         null::boolean as online,
         c.avatar_url,
         null::timestamptz as last_seen
  from public.chats c
  where c.type in ('group', 'channel') and not coalesce(c.is_private, false);

alter view public.directory set (security_invoker = false);
grant select on public.directory to anon, authenticated;
