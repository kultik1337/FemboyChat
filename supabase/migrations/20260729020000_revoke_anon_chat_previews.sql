-- Follow-up on the Supabase security advisor: SECURITY DEFINER functions that
-- only make sense for a signed-in user should not be callable by `anon`.

revoke execute on function public.chat_previews() from anon;
revoke execute on function public.chat_previews() from public;
grant execute on function public.chat_previews() to authenticated;

revoke execute on function public.set_chat_flags(text, boolean, boolean) from anon;
revoke execute on function public.set_chat_flags(text, boolean, boolean) from public;
grant execute on function public.set_chat_flags(text, boolean, boolean) to authenticated;
