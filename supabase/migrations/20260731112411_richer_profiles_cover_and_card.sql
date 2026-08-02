-- Richer profiles: a cover image plus one RPC that answers everything the
-- profile card shows, so the client stops stitching it together from three
-- different queries (and stops guessing at things it cannot see, like the
-- chats we have in common).

alter table public.profiles add column if not exists cover_url text;

create or replace function public.profile_card(target uuid)
returns table (
  uid uuid,
  num_id bigint,
  username text,
  name text,
  bio text,
  status text,
  emoji text,
  color text,
  avatar_url text,
  cover_url text,
  verified boolean,
  is_bot boolean,
  created_at timestamptz,
  shared_chats bigint,
  is_admin boolean,
  premium boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.uid,
    p.num_id,
    p.username,
    p.name,
    p.bio,
    p.status,
    p.emoji,
    p.color,
    p.avatar_url,
    p.cover_url,
    coalesce(p.verified, false),
    coalesce(p.is_bot, false),
    p.created_at,
    -- Only groups and channels count: every direct chat is trivially shared
    -- and saying so would be noise.
    (
      select count(*)
      from public.chats c
      where c.type in ('group', 'channel')
        and c.member_uids @> array[p.uid]
        and c.member_uids @> array[auth.uid()]
    ),
    coalesce(up.is_admin, false),
    coalesce(up.premium, false)
  from public.profiles p
  left join public.user_perks up on up.uid = p.uid
  where p.uid = target
    and auth.uid() is not null;
$$;

revoke all on function public.profile_card(uuid) from public;
grant execute on function public.profile_card(uuid) to authenticated;

-- Setting your own cover goes through a function for the same reason the
-- perks table has no write policy: the column list is the whitelist.
create or replace function public.set_cover(url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update public.profiles set cover_url = nullif(btrim(coalesce(url, '')), '') where uid = auth.uid();
  return (select cover_url from public.profiles where uid = auth.uid());
end;
$$;

revoke all on function public.set_cover(text) from public;
grant execute on function public.set_cover(text) to authenticated;
