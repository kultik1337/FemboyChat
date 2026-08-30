-- Streaming AI replies.
--
-- FemboyAI used to generate its whole answer server-side and insert it as one
-- finished message. Now the edge function inserts an empty bubble first and
-- rewrites it as tokens arrive, so the reply visibly types itself out over
-- Realtime. This migration adds the one column that makes that possible and
-- teaches the push trigger to wait until the reply is actually done.

-- A bot reply that is still being generated. Inserted `true`, flipped to
-- `false` once the model finishes. Ordinary messages never touch it.
alter table public.messages
  add column if not exists streaming boolean not null default false;

-- The push fan-out must not fire for the empty placeholder — that would send a
-- notification with no body. Instead it fires once, on the UPDATE that clears
-- the streaming flag, i.e. when the reply is complete. Non-streaming inserts
-- (every human message, and the no-provider fallback) keep behaving exactly as
-- before.
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

  -- Skip the empty placeholder of a streaming reply; its push is deferred.
  if tg_op = 'INSERT' and coalesce(new.streaming, false) then
    return new;
  end if;

  -- On UPDATE, only the streaming -> done transition is worth a push. Every
  -- other update (edits, reactions, reads, pins, intermediate stream flushes)
  -- must stay silent.
  if tg_op = 'UPDATE'
     and not (coalesce(old.streaming, false) and not coalesce(new.streaming, false)) then
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
    -- A notification is never worth failing a message write over.
    return new;
end
$fn$;

-- Re-point the trigger so it also sees the completion UPDATE.
drop trigger if exists fc_push_notify on public.messages;
create trigger fc_push_notify
  after insert or update on public.messages
  for each row
  execute function public.fc_push_notify();
