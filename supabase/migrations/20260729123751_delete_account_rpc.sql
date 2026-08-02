create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $fn$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  -- Step out of every community first, keeping member_count honest.
  update public.chats
     set member_uids = array_remove(member_uids, me),
         admin_uids  = array_remove(admin_uids, me),
         member_count = greatest(coalesce(member_count, 1) - 1, 0)
   where me = any(member_uids);

  -- Hand ownership back to nobody rather than leaving a dangling owner.
  update public.chats set owner_uid = null where owner_uid = me;

  -- Own content goes away entirely. Comments hanging off a deleted post are
  -- removed by the comment_of cascade.
  delete from public.messages where sender_uid = me;
  delete from public.message_views where uid = me;
  delete from public.chat_prefs where uid = me;
  delete from public.profiles where uid = me;

  -- Finally the credentials, so the e-mail can be reused for a fresh account.
  delete from auth.users where id = me;
end;
$fn$;

revoke all on function public.delete_account() from public;
revoke all on function public.delete_account() from anon;
grant execute on function public.delete_account() to authenticated;
