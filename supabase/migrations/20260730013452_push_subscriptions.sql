-- Web Push subscriptions.
--
-- The endpoint IS the identity of a subscription (the browser mints a new one
-- whenever permission is re-granted), so it is the primary key. A user can hold
-- many: phone, laptop, installed app.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  uid uuid not null references public.profiles(uid) on delete cascade,
  p256dh text not null,
  auth_secret text not null,
  device_key text,
  ua text,
  enabled boolean not null default true,
  failures smallint not null default 0,
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now()
);

create index if not exists push_subscriptions_uid_idx on public.push_subscriptions (uid) where enabled;

alter table public.push_subscriptions enable row level security;

-- Direct table access is never needed from the browser: everything goes through
-- the RPCs below, and the fan-out runs with the service role.
revoke all on public.push_subscriptions from anon, authenticated;

drop policy if exists push_subs_own_select on public.push_subscriptions;
create policy push_subs_own_select on public.push_subscriptions
  for select to authenticated
  using (uid = auth.uid());

-- Upsert on endpoint: re-subscribing on the same device must not pile up rows,
-- and a device handed to another account must change owner, not duplicate.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device text default null,
  p_ua text default null
) returns boolean
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  if auth.uid() is null then
    return false;
  end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    return false;
  end if;

  insert into public.push_subscriptions (endpoint, uid, p256dh, auth_secret, device_key, ua, enabled, failures, last_used)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, p_device, p_ua, true, 0, now())
  on conflict (endpoint) do update
    set uid = auth.uid(),
        p256dh = excluded.p256dh,
        auth_secret = excluded.auth_secret,
        device_key = coalesce(excluded.device_key, public.push_subscriptions.device_key),
        ua = coalesce(excluded.ua, public.push_subscriptions.ua),
        enabled = true,
        failures = 0,
        last_used = now();

  return true;
end
$fn$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  if auth.uid() is null then
    return false;
  end if;
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and uid = auth.uid();
  return true;
end
$fn$;

-- How many devices are subscribed for the current user, for the Settings UI.
create or replace function public.my_push_count()
returns integer
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select count(*)::int
    from public.push_subscriptions
   where uid = auth.uid()
     and enabled;
$fn$;

-- A dropped function loses its grants, so they are re-issued here every time.
revoke all on function public.save_push_subscription(text, text, text, text, text) from anon, authenticated;
revoke all on function public.delete_push_subscription(text) from anon, authenticated;
revoke all on function public.my_push_count() from anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.my_push_count() to authenticated;
