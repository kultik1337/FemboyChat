-- Delete the FILE when a disappearing message burns.
--
-- Until now the row vanished on schedule and the upload stayed in the bucket
-- forever. "Disappearing" that leaves the photo on the server is a promise the
-- product does not keep, so this closes the gap.
--
-- SQL cannot do the deleting: storage.protect_delete() raises on any direct
-- delete from storage.objects. So the purge only writes down WHAT should go,
-- and the `storage-gc` edge function does the deleting through the Storage API.

create table if not exists public.fc_storage_gc (
  bucket text not null,
  path text not null,
  queued_at timestamptz not null default now(),
  tries integer not null default 0,
  last_error text,
  primary key (bucket, path)
);

-- No policies on purpose: this queue belongs to the server alone. The service
-- role bypasses RLS, everyone else gets nothing.
alter table public.fc_storage_gc enable row level security;
revoke all on table public.fc_storage_gc from anon, authenticated;

create index if not exists fc_storage_gc_queued_idx on public.fc_storage_gc (queued_at);

-- ── purge: same deletion as before, now remembering the files ───────────────
create or replace function public.fc_purge_expired_messages()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  removed integer;
begin
  -- Comments are wired with `on delete cascade`, so a purged post takes its
  -- thread with it. message_views cascade the same way.
  --
  -- Attachments of those cascade-deleted comments are NOT seen here: the
  -- cascade happens below this statement's returning clause. They are caught
  -- later by fc_storage_orphans(), which is exactly why that safety net exists.
  with gone as (
    delete from public.messages
    where ttl is not null
      and ts + make_interval(secs => ttl) < now()
    returning attachment
  ),
  paths as (
    select distinct coalesce(
      g.attachment ->> 'path',
      -- legacy rows stored a public URL instead of a bare object path
      substring(split_part(g.attachment ->> 'url', '?', 1) from '/attachments/(.*)$')
    ) as path
    from gone g
    where g.attachment is not null
  ),
  queued as (
    insert into public.fc_storage_gc (bucket, path)
    select 'attachments', p.path
    from paths p
    where p.path is not null and p.path <> ''
    on conflict (bucket, path) do nothing
    returning 1
  )
  select count(*) into removed from gone;

  return removed;
end;
$function$;

-- ── safety net: files nothing points at any more ────────────────────────────
create or replace function public.fc_storage_orphans(p_limit integer default 100)
returns table (path text)
language sql
security definer
set search_path to 'public'
as $function$
  select o.name
  from storage.objects o
  where o.bucket_id = 'attachments'
    -- A file is uploaded a moment BEFORE the message that references it, so a
    -- fresh "orphan" is usually an upload still in flight. A day of grace makes
    -- a false positive impossible in practice.
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1
      from public.messages m
      where m.attachment is not null
        and (
          m.attachment ->> 'path' = o.name
          or right(split_part(m.attachment ->> 'url', '?', 1), length(o.name) + 1) = '/' || o.name
        )
    )
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

revoke all on function public.fc_storage_orphans(integer) from public, anon, authenticated;

-- ── cron: hand the work to the edge function ────────────────────────────────
select cron.unschedule('fc-storage-gc')
where exists (select 1 from cron.job where jobname = 'fc-storage-gc');

select cron.schedule('fc-storage-gc', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https' || '://' || 'azriyxvofeceosuoptcm' || '.supabase' || '.co' || '/functions/v1/storage-gc',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-fc-secret', public.get_fc_webhook_secret()
    ),
    body := jsonb_build_object('action', 'sweep')
  );
$cron$);
