-- Attachments move from a fully public bucket to a private one.
--
-- Until now anyone who knew (or guessed) an object path could fetch any file
-- ever uploaded, with no session at all. From here on the bucket is private and
-- the client asks for a short-lived signed URL per file.
--
-- Reading is allowed when either:
--   * the caller uploaded the file (the first path segment is their uid), or
--   * the file is attached to a message in a chat the caller belongs to.
--
-- The lookup is wrapped in a security-definer function so the policy does not
-- depend on the caller's own read access to messages/chats.
create or replace function public.fc_can_read_attachment(object_name text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select
    split_part(object_name, '/', 1) = coalesce(auth.uid()::text, '\\x00')
    or exists (
      select 1
      from public.messages m
      join public.chats c on c.id = m.chat_id
      where m.attachment is not null
        and auth.uid() = any (c.member_uids)
        and (
          -- files stored with an explicit path (new uploads may carry one)
          m.attachment ->> 'path' = object_name
          -- legacy rows: the stored URL ends with /attachments/<object_name>
          or right(split_part(m.attachment ->> 'url', '?', 1), length(object_name) + 1)
             = '/' || object_name
        )
    )
$fn$;

revoke all on function public.fc_can_read_attachment(text) from public;
revoke all on function public.fc_can_read_attachment(text) from anon;
grant execute on function public.fc_can_read_attachment(text) to authenticated;

-- Speeds the policy's lookup up: without it every signed-URL request would scan
-- the whole messages table.
create index if not exists messages_attachment_url_idx
  on public.messages ((attachment ->> 'url'))
  where attachment is not null;

drop policy if exists attachments_owner_select on storage.objects;
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.fc_can_read_attachment(name));

update storage.buckets set public = false where id = 'attachments';
