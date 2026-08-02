-- Short-lived tickets for the AI assistant edge function.
--
-- The function needs to know who is asking and whether they are actually in
-- the chat they want summarised. Rather than teaching the browser client to
-- forward its access token to a second service, the database hands out a
-- one-minute ticket that already encodes "this uid may read this chat".

create table if not exists public.assist_tickets (
  token text primary key,
  uid uuid not null,
  chat_id text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.assist_tickets enable row level security;
-- No policies at all: only security-definer code and the service role touch it.

create or replace function public.assist_ticket(p_chat text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); tok text;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.chats c where c.id = p_chat and me = any(c.member_uids)) then
    raise exception 'Этот чат вам недоступен';
  end if;
  delete from public.assist_tickets where expires_at < now() - interval '1 hour';
  tok := encode(gen_random_bytes(24), 'hex');
  insert into public.assist_tickets (token, uid, chat_id, expires_at)
  values (tok, me, p_chat, now() + interval '2 minutes');
  return tok;
end $$;

revoke all on function public.assist_ticket(text) from public;
grant execute on function public.assist_ticket(text) to authenticated;

-- Redeemed by the edge function with the service role key.
create or replace function public.redeem_assist_ticket(p_token text)
returns table (uid uuid, chat_id text)
language plpgsql
security definer
set search_path = public
as $$
declare row public.assist_tickets;
begin
  select * into row from public.assist_tickets where token = p_token;
  if not found then return; end if;
  if row.used or row.expires_at < now() then return; end if;
  update public.assist_tickets set used = true where token = p_token;
  uid := row.uid;
  chat_id := row.chat_id;
  return next;
end $$;

revoke all on function public.redeem_assist_ticket(text) from public;
grant execute on function public.redeem_assist_ticket(text) to service_role;
