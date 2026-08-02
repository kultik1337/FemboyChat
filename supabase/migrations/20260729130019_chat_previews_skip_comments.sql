-- Comments share the messages table with ordinary posts, so a comment on a
-- channel post would otherwise surface as that channel's last message in the
-- sidebar. Previews must only ever consider top-level messages.
create or replace function public.chat_previews()
returns table(chat_id text, id uuid, sender_uid uuid, text text, ts timestamp with time zone, sticker text, attachment jsonb, deleted boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select distinct on (m.chat_id)
         m.chat_id, m.id, m.sender_uid, m.text, m.ts, m.sticker, m.attachment, m.deleted
  from public.messages m
  join public.chats c on c.id = m.chat_id
  where (auth.uid() = any(c.member_uids)
     or (c.type = 'saved' and c.owner_uid = auth.uid()))
    and m.comment_of is null
  order by m.chat_id, m.ts desc
$function$;
