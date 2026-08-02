-- Bots people build themselves.
--
-- A bot is an ordinary profile row with is_bot = true, so every screen that
-- already knows how to draw a person draws a bot for free. This table only adds
-- what a profile cannot express: who owns it and how it should behave.
create table if not exists public.bots (
  uid uuid primary key,
  owner_uid uuid not null,
  persona text not null default '',
  greeting text not null default '',
  temperature real not null default 0.9,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bots_owner_idx on public.bots (owner_uid);

alter table public.bots enable row level security;

drop policy if exists bots_select on public.bots;
create policy bots_select on public.bots
  for select to authenticated
  using (owner_uid = auth.uid() or is_public or public.fc_is_admin());

grant select on public.bots to authenticated;

-- Creating a bot needs a perk, and the perk carries a quota with it.
create or replace function public.create_bot(
  p_username text,
  p_name text,
  p_persona text default '',
  p_greeting text default '',
  p_emoji text default '🤖',
  p_color text default '#7c9cff',
  p_public boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  allowed boolean;
  quota integer;
  used integer;
  clean_username text;
  new_uid uuid := gen_random_uuid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;

  select coalesce(up.can_create_bots, false), coalesce(up.max_bots, 0)
    into allowed, quota
    from public.user_perks up where up.uid = me;

  if not coalesce(allowed, false) then
    raise exception 'bots are not enabled for this account';
  end if;

  select count(*) into used from public.bots b where b.owner_uid = me;
  if used >= coalesce(quota, 0) then
    raise exception 'bot limit reached (%)', coalesce(quota, 0);
  end if;

  clean_username := lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9_]', '', 'g'));
  if length(clean_username) < 3 then
    raise exception 'username too short';
  end if;
  if exists (select 1 from public.profiles pr where pr.username = clean_username) then
    raise exception 'username taken';
  end if;

  insert into public.profiles (uid, username, name, emoji, color, bio, is_bot, verified, settings, created_at)
  values (
    new_uid,
    clean_username,
    coalesce(nullif(trim(p_name), ''), clean_username),
    coalesce(nullif(p_emoji, ''), '🤖'),
    coalesce(nullif(p_color, ''), '#7c9cff'),
    left(coalesce(p_persona, ''), 200),
    true,
    false,
    '{}'::jsonb,
    now()
  );

  insert into public.bots (uid, owner_uid, persona, greeting, is_public)
  values (new_uid, me, left(coalesce(p_persona, ''), 4000), left(coalesce(p_greeting, ''), 500), coalesce(p_public, false));

  return jsonb_build_object('uid', new_uid, 'username', clean_username);
end;
$$;

-- Owner or admin may edit. Nulls mean "leave this field alone", so the client
-- can send a single changed field instead of the whole bot.
create or replace function public.update_bot(
  p_uid uuid,
  p_name text default null,
  p_persona text default null,
  p_greeting text default null,
  p_emoji text default null,
  p_color text default null,
  p_public boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select b.owner_uid into owner from public.bots b where b.uid = p_uid;
  if owner is null then
    raise exception 'no such bot';
  end if;
  if owner <> auth.uid() and not public.fc_is_admin() then
    raise exception 'not allowed';
  end if;

  update public.bots
     set persona = coalesce(left(p_persona, 4000), persona),
         greeting = coalesce(left(p_greeting, 500), greeting),
         is_public = coalesce(p_public, is_public),
         updated_at = now()
   where uid = p_uid;

  update public.profiles
     set name = coalesce(nullif(trim(p_name), ''), name),
         emoji = coalesce(nullif(p_emoji, ''), emoji),
         color = coalesce(nullif(p_color, ''), color),
         bio = coalesce(left(p_persona, 200), bio)
   where uid = p_uid;

  return jsonb_build_object('uid', p_uid);
end;
$$;

create or replace function public.delete_bot(p_uid uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select b.owner_uid into owner from public.bots b where b.uid = p_uid;
  if owner is null then
    return false;
  end if;
  if owner <> auth.uid() and not public.fc_is_admin() then
    raise exception 'not allowed';
  end if;
  delete from public.bots where uid = p_uid;
  -- The profile goes too, otherwise a nameless ghost stays in the directory.
  delete from public.profiles where uid = p_uid and is_bot = true;
  return true;
end;
$$;

-- Everything the owner needs to draw their list of bots.
create or replace function public.my_bots()
returns table (
  uid uuid,
  username text,
  name text,
  emoji text,
  color text,
  persona text,
  greeting text,
  is_public boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.uid, pr.username, pr.name, pr.emoji, pr.color, b.persona, b.greeting, b.is_public, b.created_at
  from public.bots b
  join public.profiles pr on pr.uid = b.uid
  where b.owner_uid = auth.uid()
  order by b.created_at desc
$$;

grant execute on function public.create_bot(text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.update_bot(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_bot(uuid) to authenticated;
grant execute on function public.my_bots() to authenticated;
