-- The previous version wrote the fallback emoji as an escape sequence, which
-- Postgres stores literally: profiles without an emoji would show the text
-- "\\ud83d\\udc64" instead of a face. Same query, real character.
create or replace function public.list_perks(q text default null, lim integer default 60)
returns table (
  uid uuid,
  username text,
  name text,
  num_id bigint,
  emoji text,
  color text,
  avatar_url text,
  is_admin boolean,
  can_create_bots boolean,
  premium boolean,
  verified boolean,
  max_bots integer,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.uid,
    pr.username,
    pr.name,
    pr.num_id,
    coalesce(nullif(pr.emoji, ''), '👤'),
    coalesce(nullif(pr.color, ''), '#7c9cff'),
    pr.avatar_url,
    coalesce(up.is_admin, false),
    coalesce(up.can_create_bots, false),
    coalesce(up.premium, false),
    coalesce(up.verified, false),
    coalesce(up.max_bots, 0),
    up.note
  from public.profiles pr
  left join public.user_perks up on up.uid = pr.uid
  where public.fc_is_admin()
    and (
      q is null
      or q = ''
      or pr.username ilike '%' || q || '%'
      or pr.name ilike '%' || q || '%'
      or pr.num_id::text = q
    )
    and ((q is not null and q <> '') or up.uid is not null)
  order by coalesce(up.is_admin, false) desc, pr.num_id asc
  limit greatest(1, least(coalesce(lim, 60), 200))
$$;
