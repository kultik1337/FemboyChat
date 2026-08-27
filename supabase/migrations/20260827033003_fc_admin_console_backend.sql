-- Серверная часть страницы админ-управления: баны, жалобы, admin_* RPC.
-- Все admin_* функции — SECURITY DEFINER, первым действием проверяют fc_is_admin()
-- и выданы только роли authenticated.

-- ── bans ───────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists ban_reason text;

create or replace function public.fc_is_banned(u uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select p.banned_until > now() from public.profiles p where p.uid = u), false)
$$;

create or replace function public.fc_ban_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.fc_is_banned(auth.uid()) then
    raise exception 'Аккаунт заблокирован администратором';
  end if;
  return new;
end $$;

drop trigger if exists fc_ban_guard_messages on public.messages;
create trigger fc_ban_guard_messages before insert on public.messages
  for each row execute function public.fc_ban_guard();

-- ── reports ─────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_uid uuid not null references public.profiles(uid) on delete cascade,
  target_type text not null check (target_type in ('user','chat','message')),
  target_id text not null,
  reason text not null,
  note text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(uid) on delete set null,
  resolved_at timestamptz
);
alter table public.reports enable row level security;
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_uid = (select auth.uid()));
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports for select to authenticated
  using (reporter_uid = (select auth.uid()) or public.fc_is_admin());
create index if not exists reports_status_idx on public.reports(status, created_at desc);
create index if not exists reports_reporter_idx on public.reports(reporter_uid);
create index if not exists reports_resolved_by_idx on public.reports(resolved_by);

create or replace function public.report_content(p_target_type text, p_target_id text, p_reason text, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if p_target_type not in ('user','chat','message') then raise exception 'Unknown target'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Нужна причина'; end if;
  insert into public.reports (reporter_uid, target_type, target_id, reason, note)
  values (me, p_target_type, p_target_id, btrim(p_reason), nullif(btrim(coalesce(p_note,'')), ''))
  returning id into new_id;
  return new_id;
end $$;

-- ── admin: обзор ───────────────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare result jsonb;
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles where coalesce(is_bot,false) = false),
    'bots', (select count(*) from public.profiles where coalesce(is_bot,false)),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'online', (select count(*) from public.profiles where last_seen > now() - interval '5 minutes'),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'chats', (select count(*) from public.chats),
    'groups', (select count(*) from public.chats where type = 'group'),
    'channels', (select count(*) from public.chats where type = 'channel'),
    'dms', (select count(*) from public.chats where type = 'dm'),
    'messages', (select count(*) from public.messages),
    'messages_24h', (select count(*) from public.messages where ts > now() - interval '24 hours'),
    'messages_7d', (select count(*) from public.messages where ts > now() - interval '7 days'),
    'attachments', (select count(*) from public.messages where attachment is not null),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'top_chats', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select c.id, c.title, c.type, count(m.id) as messages
        from public.chats c
        left join public.messages m on m.chat_id = c.id and m.ts > now() - interval '7 days'
        group by c.id, c.title, c.type
        order by count(m.id) desc, c.title
        limit 8) t),
    'daily', (select coalesce(jsonb_agg(d), '[]'::jsonb) from (
        select to_char(date_trunc('day', ts), 'YYYY-MM-DD') as day, count(*) as messages
        from public.messages
        where ts > now() - interval '14 days'
        group by 1 order by 1) d)
  ) into result;
  return result;
end $$;

-- ── admin: люди ───────────────────────────────────────────────────────
create or replace function public.admin_list_users(q text default null, lim integer default 60)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare result jsonb; needle text := nullif(btrim(coalesce(q,'')), '');
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  needle := regexp_replace(coalesce(needle,''), '^@', '');
  needle := nullif(needle, '');
  select coalesce(jsonb_agg(t), '[]'::jsonb) into result from (
    select p.uid, p.username, p.name, p.num_id, p.emoji, p.color, p.avatar_url, p.email,
           coalesce(p.is_bot,false) as is_bot, coalesce(p.verified,false) as verified,
           p.created_at, p.last_seen, p.banned_until, p.ban_reason,
           coalesce(up.is_admin,false) as is_admin,
           coalesce(up.premium,false) as premium,
           coalesce(up.can_create_bots,false) as can_create_bots,
           coalesce(up.max_bots,0) as max_bots,
           (select count(*) from public.messages m where m.sender_uid = p.uid) as messages
    from public.profiles p
    left join public.user_perks up on up.uid = p.uid
    where needle is null
       or p.username ilike '%' || needle || '%'
       or p.name ilike '%' || needle || '%'
       or p.uid::text = needle
       or p.num_id::text = needle
    order by p.last_seen desc nulls last
    limit greatest(1, least(coalesce(lim, 60), 200))
  ) t;
  return result;
end $$;

create or replace function public.admin_ban_user(target uuid, days integer default null, reason text default null)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  if target = auth.uid() then raise exception 'Нельзя забанить себя'; end if;
  if public.fc_is_admin(target) then raise exception 'Сначала снимите права администратора'; end if;
  update public.profiles
     set banned_until = case when days is null then 'infinity'::timestamptz else now() + make_interval(days => days) end,
         ban_reason = nullif(btrim(coalesce(reason,'')), '')
   where uid = target;
  return found;
end $$;

create or replace function public.admin_unban_user(target uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  update public.profiles set banned_until = null, ban_reason = null where uid = target;
  return found;
end $$;

create or replace function public.admin_set_verified(target uuid, value boolean)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  update public.profiles set verified = coalesce(value, false) where uid = target;
  return found;
end $$;

-- ── admin: чаты ───────────────────────────────────────────────────────
create or replace function public.admin_list_chats(q text default null, lim integer default 60)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare result jsonb; needle text := nullif(btrim(coalesce(q,'')), '');
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into result from (
    select c.id, c.type, c.title, c.username, c.emoji, c.color, c.avatar_url,
           coalesce(c.is_private,false) as is_private, coalesce(c.verified,false) as verified,
           c.owner_uid, c.member_count, coalesce(cardinality(c.member_uids), 0) as members_real,
           c.created_at,
           (select count(*) from public.messages m where m.chat_id = c.id) as messages,
           (select max(m.ts) from public.messages m where m.chat_id = c.id) as last_message_at
    from public.chats c
    where needle is null
       or c.title ilike '%' || needle || '%'
       or c.username ilike '%' || needle || '%'
       or c.id = needle
    order by (select max(m.ts) from public.messages m where m.chat_id = c.id) desc nulls last
    limit greatest(1, least(coalesce(lim, 60), 200))
  ) t;
  return result;
end $$;

create or replace function public.admin_set_chat_verified(p_chat text, value boolean)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  update public.chats set verified = coalesce(value, false) where id = p_chat;
  return found;
end $$;

create or replace function public.admin_delete_chat(p_chat text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  begin
    delete from public.chats where id = p_chat;
  exception when foreign_key_violation then
    delete from public.messages where chat_id = p_chat;
    delete from public.chats where id = p_chat;
  end;
  return true;
end $$;

-- ── admin: сообщения ──────────────────────────────────────────────────
create or replace function public.admin_search_messages(q text default null, p_chat text default null, lim integer default 60)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare result jsonb; needle text := nullif(btrim(coalesce(q,'')), '');
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into result from (
    select m.id, m.chat_id, c.title as chat_title, m.sender_uid,
           p.username as sender_username, p.name as sender_name,
           m.text, m.ts, coalesce(m.deleted,false) as deleted,
           (m.attachment is not null) as has_attachment
    from public.messages m
    left join public.chats c on c.id = m.chat_id
    left join public.profiles p on p.uid = m.sender_uid
    where (needle is null or m.text ilike '%' || needle || '%')
      and (p_chat is null or m.chat_id = p_chat)
    order by m.ts desc
    limit greatest(1, least(coalesce(lim, 60), 200))
  ) t;
  return result;
end $$;

create or replace function public.admin_delete_message(p_message uuid, hard boolean default false)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  if coalesce(hard, false) then
    delete from public.messages where id = p_message;
  else
    update public.messages set deleted = true, text = '' where id = p_message;
  end if;
  return found;
end $$;

-- ── admin: жалобы ─────────────────────────────────────────────────────
create or replace function public.admin_list_reports(p_status text default 'open', lim integer default 60)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare result jsonb;
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into result from (
    select r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at,
           r.reporter_uid, p.username as reporter_username, p.name as reporter_name,
           r.resolved_at, r.resolved_by
    from public.reports r
    left join public.profiles p on p.uid = r.reporter_uid
    where p_status is null or p_status = 'all' or r.status = p_status
    order by r.created_at desc
    limit greatest(1, least(coalesce(lim, 60), 200))
  ) t;
  return result;
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  if p_status not in ('open','resolved','dismissed') then raise exception 'Unknown status'; end if;
  update public.reports
     set status = p_status,
         resolved_by = case when p_status = 'open' then null else auth.uid() end,
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_report;
  return found;
end $$;

-- ── grants ────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_overview','admin_list_users','admin_ban_user','admin_unban_user','admin_set_verified',
        'admin_list_chats','admin_set_chat_verified','admin_delete_chat','admin_search_messages',
        'admin_delete_message','admin_list_reports','admin_resolve_report','report_content',
        'fc_is_banned','fc_ban_guard'
      )
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    if r.proname <> 'fc_ban_guard' then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;
