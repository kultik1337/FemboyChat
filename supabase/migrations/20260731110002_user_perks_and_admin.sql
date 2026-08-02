-- Perks and roles for the messenger.
--
-- One row per person, created lazily: no row means "no perks", so the default
-- is deny and the table stays tiny.
create table if not exists public.user_perks (
  uid uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  can_create_bots boolean not null default false,
  premium boolean not null default false,
  verified boolean not null default false,
  max_bots integer not null default 3,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.user_perks enable row level security;

-- SECURITY DEFINER on purpose: a policy on user_perks may never subquery
-- user_perks directly (infinite recursion), but a definer function owned by the
-- table owner reads it with RLS bypassed, which is the supported way out.
create or replace function public.fc_is_admin(u uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.user_perks p where p.uid = u), false)
$$;

drop policy if exists user_perks_select on public.user_perks;
create policy user_perks_select on public.user_perks
  for select to authenticated
  using (uid = auth.uid() or public.fc_is_admin());

-- No insert/update/delete policies: writes go exclusively through the RPCs
-- below, so every change is checked and attributed.
grant select on public.user_perks to authenticated;

-- Everything the client needs to decide what to show. Always an object, never
-- null, so the UI has no special case for "no row yet".
create or replace function public.my_perks()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select to_jsonb(p) - 'note' - 'updated_by' from public.user_perks p where p.uid = auth.uid()),
    jsonb_build_object(
      'uid', auth.uid(),
      'is_admin', false,
      'can_create_bots', false,
      'premium', false,
      'verified', false,
      'max_bots', 0
    )
  )
$$;

-- Admin view: everyone who already has perks, plus anyone matching the search.
create or replace function public.list_perks(q text default null, lim integer default 60)
returns table (
  uid uuid,
  username text,
  name text,
  num_id bigint,
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

-- Grant or revoke one boolean perk. The whitelist is what keeps this from
-- becoming an arbitrary UPDATE endpoint.
create or replace function public.set_perk(target uuid, perk text, value boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  updated public.user_perks;
begin
  if not public.fc_is_admin() then
    raise exception 'not allowed';
  end if;
  if perk not in ('is_admin', 'can_create_bots', 'premium', 'verified') then
    raise exception 'unknown perk %', perk;
  end if;
  -- Locking yourself out of the admin panel is not a recoverable mistake.
  if perk = 'is_admin' and target = auth.uid() and value = false then
    raise exception 'cannot remove your own admin';
  end if;

  insert into public.user_perks (uid, updated_by) values (target, auth.uid())
  on conflict (uid) do nothing;

  update public.user_perks
     set is_admin = case when perk = 'is_admin' then value else is_admin end,
         can_create_bots = case when perk = 'can_create_bots' then value else can_create_bots end,
         premium = case when perk = 'premium' then value else premium end,
         verified = case when perk = 'verified' then value else verified end,
         updated_at = now(),
         updated_by = auth.uid()
   where uid = target
   returning * into updated;

  -- The verified tick lives on the profile too, because that is what every
  -- chat list and header already reads.
  if perk = 'verified' then
    update public.profiles set verified = value where uid = target;
  end if;

  return to_jsonb(updated);
end;
$$;

-- How many bots one person may own. Separate from set_perk because it is a
-- number, and mixing the two would mean an untyped value argument.
create or replace function public.set_max_bots(target uuid, value integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  updated public.user_perks;
begin
  if not public.fc_is_admin() then
    raise exception 'not allowed';
  end if;
  insert into public.user_perks (uid, updated_by) values (target, auth.uid())
  on conflict (uid) do nothing;
  update public.user_perks
     set max_bots = greatest(0, least(coalesce(value, 0), 50)),
         updated_at = now(),
         updated_by = auth.uid()
   where uid = target
   returning * into updated;
  return to_jsonb(updated);
end;
$$;

revoke all on function public.set_perk(uuid, text, boolean) from public;
revoke all on function public.set_max_bots(uuid, integer) from public;
revoke all on function public.list_perks(text, integer) from public;
grant execute on function public.my_perks() to authenticated;
grant execute on function public.fc_is_admin(uuid) to authenticated;
grant execute on function public.list_perks(text, integer) to authenticated;
grant execute on function public.set_perk(uuid, text, boolean) to authenticated;
grant execute on function public.set_max_bots(uuid, integer) to authenticated;

-- The first administrator: the owner of the messenger.
insert into public.user_perks (uid, is_admin, can_create_bots, premium, verified, max_bots, note)
values ('8bf4ffcf-bd68-4ee9-8ae6-d6ad9e981f12', true, true, true, true, 20, 'owner')
on conflict (uid) do update
  set is_admin = true,
      can_create_bots = true,
      premium = true,
      max_bots = greatest(public.user_perks.max_bots, 20),
      updated_at = now();
