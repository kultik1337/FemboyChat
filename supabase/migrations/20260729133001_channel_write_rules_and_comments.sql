-- The old insert rule let ANY member of a chat write to it, so "only admins
-- can publish in a channel" was enforced by the UI alone: a crafted request
-- could post into a read-only channel. Move the rule to the server.
--
-- New shape:
--   * regular chats  -> any member may write, as before
--   * channels       -> only admins/owner may publish a top-level post
--   * channels       -> ANY member may add a comment (comment_of is not null)
--   * a comment must hang off a message in the same chat, so comment_of
--     cannot be pointed at a post in a chat the author cannot see
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
    or exists (
      select 1
        from public.messages parent
       where parent.id = messages.comment_of
         and parent.chat_id = messages.chat_id
         and parent.comment_of is null
    )
  )
);
