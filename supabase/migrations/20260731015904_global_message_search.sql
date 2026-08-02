-- Global search across every message the caller is allowed to read.
--
-- SECURITY INVOKER is the whole point: the function does no permission work of
-- its own, it simply runs the query as the caller, so the existing
-- `messages_select` policy decides what may be returned. A SECURITY DEFINER
-- version would have leaked other people's chats.
create extension if not exists pg_trgm;

-- Trigram index so `ilike '%...%'` does not degrade into a sequential scan as
-- the table grows.
create index if not exists messages_text_trgm_idx
  on public.messages using gin (text gin_trgm_ops);

create or replace function public.search_messages(q text, lim int default 40)
returns table (
  id uuid,
  chat_id text,
  sender_uid uuid,
  text text,
  ts timestamptz,
  attachment jsonb,
  sticker text
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id, m.chat_id, m.sender_uid, m.text, m.ts, m.attachment, m.sticker
  from public.messages m
  where coalesce(m.deleted, false) = false
    and m.comment_of is null
    and length(coalesce(q, '')) >= 2
    and m.text ilike '%' || q || '%'
  order by m.ts desc
  limit least(coalesce(lim, 40), 100)
$$;

revoke all on function public.search_messages(text, int) from public, anon;
grant execute on function public.search_messages(text, int) to authenticated;
