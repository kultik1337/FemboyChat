-- PR-1: close open data access (profiles, chats, messages, storage listing)
--
-- Before this migration:
--   * profiles_select and chats_select were USING (true) for role public, so any
--     anonymous client could dump every profile (including e-mail) and every
--     chat row (including invite codes of private groups).
--   * messages_insert only checked sender_uid = auth.uid(); because DM chat ids
--     are deterministic ('dm-<uid1>~<uid2>'), anyone could write into a DM they
--     are not part of.
--   * the attachments bucket allowed anonymous listing of every uploaded file.

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (uid = auth.uid());

create policy profiles_select_bots on public.profiles
  for select to authenticated
  using (coalesce(is_bot, false));

create policy profiles_select_peers on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.chats c
    where auth.uid() = any(c.member_uids)
      and profiles.uid = any(c.member_uids)
  ));

-- Public discovery still works through the directory view, which never
-- exposes e-mail addresses or settings.
alter view public.directory set (security_invoker = false);
grant select on public.directory to anon, authenticated;

-- Registration has to be able to check nick availability without being able to
-- read the profiles table.
create or replace function public.username_available(uname text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not exists (
    select 1 from public.profiles p
    where lower(p.username) = lower(btrim(coalesce(uname, '')))
  )
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── chats ───────────────────────────────────────────────────────────────────
drop policy if exists chats_select on public.chats;

create policy chats_select_member on public.chats
  for select to authenticated
  using (auth.uid() = any(member_uids) or owner_uid = auth.uid());

create policy chats_select_public on public.chats
  for select to anon, authenticated
  using (type in ('group', 'channel') and coalesce(is_private, false) = false);

-- ── messages ────────────────────────────────────────────────────────────────
drop policy if exists messages_insert on public.messages;

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_uid = auth.uid()
    and exists (
      select 1 from public.chats c
      where c.id = chat_id and auth.uid() = any(c.member_uids)
    )
  );

-- ── storage: stop bucket enumeration ────────────────────────────────────────
drop policy if exists attachments_public_select on storage.objects;

create policy attachments_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- TODO (follow-up): flip the attachments bucket to private and serve files via
-- signed URLs. That needs a client change, because message rows currently store
-- absolute public URLs.
