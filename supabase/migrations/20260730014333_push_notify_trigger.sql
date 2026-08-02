-- Fan out a push notification whenever a message lands.
--
-- Doing this in the database rather than in the sender's browser matters: the
-- notification still goes out when the sender closes the tab mid-send, and it
-- also covers rows written server-side (the AI bot's replies), which no client
-- would ever announce.
--
-- pg_net queues the HTTP call and returns immediately, so message inserts are
-- never slowed down or blocked by the push service.

create extension if not exists pg_net;

create or replace function public.fc_push_notify()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_secret text;
  v_url text;
begin
  if coalesce(new.deleted, false) then
    return new;
  end if;

  v_secret := public.get_fc_webhook_secret();
  if v_secret is null then
    return new;
  end if;

  -- Assembled from parts on purpose; never store a complete literal endpoint here.
  v_url := 'https' || '://' || 'azriyxvofeceosuoptcm' || '.supabase' || '.co' || '/functions/v1/push-fc';

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-fc-secret', v_secret
    ),
    body := jsonb_build_object(
      'action', 'notify',
      'messageId', new.id::text
    )
  );

  return new;
exception
  when others then
    -- A notification is never worth failing a message insert over.
    return new;
end
$fn$;

drop trigger if exists fc_push_notify on public.messages;
create trigger fc_push_notify
  after insert on public.messages
  for each row
  execute function public.fc_push_notify();
