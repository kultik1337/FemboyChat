-- The previous version of messages_insert checked the parent post with a
-- subquery on public.messages itself. Evaluating that subquery re-triggered
-- the policies of the same table, so Postgres aborted with
-- "infinite recursion detected in policy for relation messages" and every
-- comment insert failed. The lookup now lives in a security definer helper,
-- which reads the table without re-entering RLS.
create or replace function public.fc_is_post_in_chat(post_id uuid, chat text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1
      from public.messages p
     where p.id = post_id
       and p.chat_id = chat
       and p.comment_of is null
  );
$fn$;

revoke all on function public.fc_is_post_in_chat(uuid, text) from public;
revoke all on function public.fc_is_post_in_chat(uuid, text) from anon;
grant execute on function public.fc_is_post_in_chat(uuid, text) to authenticated;

drop policy if exists messages_insert on public.messages;

create policy messages_insert on public.messages
for insert to authenticated
with check (
  sender_uid = auth.uid()
  and exists (
    select 1
      from public.chats c
     where c.id = messages.chat_id
       and auth.uid() = any (c.member_uids)
       and (
         c.type <> 'channel'
         or messages.comment_of is not null
         or auth.uid() = any (c.admin_uids)
         or c.owner_uid = auth.uid()
       )
  )
  and (
    messages.comment_of is null
    or public.fc_is_post_in_chat(messages.comment_of, messages.chat_id)
  )
);
