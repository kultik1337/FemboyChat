-- The AI trigger used to fire only for FemboyAI. Custom bots are ordinary bot
-- profiles in their own chats, so the same webhook has to wake up for them too;
-- the edge function decides whose persona to answer with.
--
-- KisKis keeps its own trigger and is not in `bots`, so it is unaffected: the
-- function skips any bot chat it cannot find a persona for.
create or replace function public.fc_trigger_femboy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  fem uuid := '00000000-0000-4000-8000-000000000002';
  ch public.chats;
  secret text;
  has_bot boolean;
begin
  if NEW.sender_uid = fem then return NEW; end if;            -- don't reply to self
  if coalesce(NEW.deleted, false) then return NEW; end if;
  select * into ch from public.chats where id = NEW.chat_id;
  if not found or ch.type <> 'bot' then return NEW; end if;

  -- A bot in this chat that we know how to answer as: FemboyAI, or one of the
  -- user-built bots. Anything else (KisKis) is somebody else's business.
  has_bot := (fem = any(ch.member_uids))
    or exists (select 1 from public.bots b where b.uid = any(ch.member_uids));
  if not has_bot then return NEW; end if;

  -- A bot must never answer its own message.
  if exists (select 1 from public.bots b where b.uid = NEW.sender_uid) then return NEW; end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'FC_WEBHOOK_SECRET' limit 1;
  perform net.http_post(
    url := 'https://azriyxvofeceosuoptcm.supabase.co/functions/v1/femboy-ai-fc',
    body := jsonb_build_object('chatId', NEW.chat_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-fc-secret', coalesce(secret, '')),
    timeout_milliseconds := 30000
  );
  return NEW;
end $function$;
