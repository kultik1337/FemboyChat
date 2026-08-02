-- Reactions are tied to a user identity, so an anonymous caller has no business
-- invoking this at all. It only became reachable because the function was
-- created before the RLS hardening pass.
revoke all on function public.toggle_reaction(uuid, text) from anon;
revoke all on function public.toggle_reaction(uuid, text) from public;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;
