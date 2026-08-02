-- VAPID keypair storage.
--
-- The keypair cannot be generated in SQL (pgcrypto has no P-256 keygen), so the
-- edge function mints it once with WebCrypto and parks it here. Only the service
-- role ever touches the row; the browser is given the public key through a
-- security-definer function that exposes NOTHING else.

create table if not exists public.push_keys (
  id smallint primary key default 1,
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now(),
  constraint push_keys_single_row check (id = 1)
);

alter table public.push_keys enable row level security;

-- No policies at all: RLS with zero policies denies everyone except the service
-- role, which bypasses RLS. That is exactly the intent for a private key.
revoke all on public.push_keys from anon, authenticated;

create or replace function public.get_vapid_public_key()
returns text
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select public_key from public.push_keys where id = 1;
$fn$;

revoke all on function public.get_vapid_public_key() from anon, authenticated;
grant execute on function public.get_vapid_public_key() to authenticated;
