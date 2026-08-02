-- Self-destructing messages used to be a client-side illusion: the bubble was
-- hidden once the timer ran out, but the row stayed in the table forever and
-- came back for anyone who reloaded. This makes the promise real on the server.

create extension if not exists pg_cron;

-- Partial index so the sweep never has to scan the whole table.
create index if not exists messages_ttl_idx on public.messages (ts) where ttl is not null;

create or replace function public.fc_purge_expired_messages()
returns integer
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  removed integer;
begin
  -- Comments are wired with `on delete cascade`, so a purged post takes its
  -- thread with it. message_views cascade the same way.
  with gone as (
    delete from public.messages
    where ttl is not null
      and ts + make_interval(secs => ttl) < now()
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$fn$;

-- Only the scheduler needs this. No client may reach it.
revoke all on function public.fc_purge_expired_messages() from public;
revoke all on function public.fc_purge_expired_messages() from anon;
revoke all on function public.fc_purge_expired_messages() from authenticated;

-- Re-scheduling under the same name replaces the old job instead of stacking.
select cron.unschedule(jobid) from cron.job where jobname = 'fc-purge-expired-messages';
select cron.schedule('fc-purge-expired-messages', '* * * * *', $job$select public.fc_purge_expired_messages()$job$);
