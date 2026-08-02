-- Forwarding: remember whose message was forwarded.
-- The client model already had `forwardedFrom`, but there was nowhere to store
-- it, so a forward silently arrived as an ordinary message from the forwarder.
alter table public.messages
  add column if not exists forwarded_from uuid references public.profiles(uid) on delete set null;

comment on column public.messages.forwarded_from is
  'Original author of a forwarded message. Null for ordinary messages.';
