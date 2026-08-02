-- Real sessions. The settings screen used to show a single hardcoded card for
-- "this device", which was decoration: signing out elsewhere did nothing.
--
-- Clients never write here directly (no insert/update/delete policy); every
-- write goes through a security definer RPC, so one account cannot touch
-- another account's session list.
create table if not exists public.user_devices (
  uid         uuid        not null references public.profiles (uid) on delete cascade,
  device_key  text        not null,
  browser     text,
  os          text,
  standalone  boolean     not null default false,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (uid, device_key)
);

alter table public.user_devices enable row level security;

drop policy if exists user_devices_own on public.user_devices;
create policy user_devices_own on public.user_devices
for select to authenticated
using (uid = auth.uid());

create index if not exists user_devices_uid_seen_idx on public.user_devices (uid, last_seen desc);

-- Announce this device and refresh its heartbeat.
-- Returns false when the row has been revoked from another device, which is
-- the signal for the client to sign itself out. A revoked row is never
-- resurrected by a heartbeat.
create or replace function public.register_device(
  key text,
  browser text default null,
  os text default null,
  standalone boolean default false
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  me uuid := auth.uid();
  killed timestamptz;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if key is null or length(trim(key)) = 0 then
    raise exception 'device key required';
  end if;

  select revoked_at into killed
    from public.user_devices
   where uid = me and device_key = key;

  if killed is not null then
    return false;
  end if;

  insert into public.user_devices (uid, device_key, browser, os, standalone)
  values (me, key, browser, os, coalesce(standalone, false))
  on conflict (uid, device_key) do update
     set last_seen  = now(),
         browser    = coalesce(excluded.browser, public.user_devices.browser),
         os         = coalesce(excluded.os, public.user_devices.os),
         standalone = excluded.standalone;

  return true;
end
$fn$;

-- Own sessions, freshest first. Revoked rows are dropped from the list.
create or replace function public.list_devices()
returns table (
  device_key text,
  browser    text,
  os         text,
  standalone boolean,
  created_at timestamptz,
  last_seen  timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select d.device_key, d.browser, d.os, d.standalone, d.created_at, d.last_seen
    from public.user_devices d
   where d.uid = auth.uid()
     and d.revoked_at is null
   order by d.last_seen desc
$fn$;

-- Sign a device out. Marking instead of deleting is deliberate: the row is
-- what tells that device, on its next heartbeat, that it has been kicked.
create or replace function public.revoke_device(key text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  me uuid := auth.uid();
  hit int;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  update public.user_devices
     set revoked_at = now()
   where uid = me
     and device_key = key
     and revoked_at is null;

  get diagnostics hit = row_count;
  return hit > 0;
end
$fn$;

revoke all on function public.register_device(text, text, text, boolean) from public;
revoke all on function public.register_device(text, text, text, boolean) from anon;
grant execute on function public.register_device(text, text, text, boolean) to authenticated;

revoke all on function public.list_devices() from public;
revoke all on function public.list_devices() from anon;
grant execute on function public.list_devices() to authenticated;

revoke all on function public.revoke_device(text) from public;
revoke all on function public.revoke_device(text) from anon;
grant execute on function public.revoke_device(text) to authenticated;
