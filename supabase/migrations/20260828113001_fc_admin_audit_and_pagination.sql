-- Журнал действий администратора, пагинация в списках админки
-- и добор мелких дыр в доступах после #134.
--
-- Мотивация: у reports уже есть resolved_by, а баны, верификации, выдача перков
-- и удаление сообщений не оставляли следа вообще. Журнал защищает и того, кого
-- забанили (видно, кто и за что), и самого админа (видно, что он этого не делал).

/* ── 1. Таблица журнала ──────────────────────────────────────────────────── */

create table if not exists public.admin_audit (
  id          bigint generated always as identity primary key,
  actor_uid   uuid references auth.users(id) on delete set null,
  action      text not null,
  target_type text not null check (target_type in ('user','chat','message','report','perk')),
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.admin_audit is
  'Append-only журнал admin_* действий. Пишется только через fc_admin_log(), читается только админами.';

create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
create index if not exists admin_audit_actor_idx   on public.admin_audit (actor_uid, created_at desc);
create index if not exists admin_audit_target_idx  on public.admin_audit (target_type, target_id, created_at desc);

alter table public.admin_audit enable row level security;

-- Из браузера журнал доступен только на чтение и только админу.
-- INSERT идёт через SECURITY DEFINER (владелец таблицы обходит RLS), поэтому
-- никаких insert/update/delete грантов ролям клиента не выдаётся.
revoke all on public.admin_audit from anon;
revoke all on public.admin_audit from authenticated;
grant select on public.admin_audit to authenticated;

drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit
  for select to authenticated
  using (public.fc_is_admin());

/* ── 2. Внутренний писатель журнала ──────────────────────────────────────── */

create or replace function public.fc_admin_log(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.admin_audit (actor_uid, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
end $function$;

/* ── 3. Мутирующие admin_* теперь пишут в журнал ─────────────────────────── */

create or replace function public.admin_ban_user(target uuid, days integer default null::integer, reason text default null::text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_until timestamptz; v_reason text;
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  if target = auth.uid() then raise exception 'Нельзя забанить себя'; end if;
  if public.fc_is_admin(target) then raise exception 'Сначала снимите права администратора'; end if;

  v_until := case when days is null then 'infinity'::timestamptz else now() + make_interval(days => days) end;
  v_reason := nullif(btrim(coalesce(reason, '')), '');

  update public.profiles
     set banned_until = v_until,
         ban_reason = v_reason
   where uid = target;

  if not found then return false; end if;

  perform public.fc_admin_log('ban_user', 'user', target::text,
    jsonb_build_object('until', v_until, 'days', days, 'reason', v_reason));
  return true;
end $function$;

create or replace function public.admin_unban_user(target uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  update public.profiles set banned_until = null, ban_reason = null where uid = target;
  if not found then return false; end if;
  perform public.fc_admin_log('unban_user', 'user', target::text, '{}'::jsonb);
  return true;
end $function$;

create or replace function public.admin_set_verified(target uuid, value boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  update public.profiles set verified = coalesce(value, false) where uid = target;
  if not found then return false; end if;
  perform public.fc_admin_log('set_verified', 'user', target::text,
    jsonb_build_object('value', coalesce(value, false)));
  return true;
end $function$;

create or replace function public.admin_set_chat_verified(p_chat text, value boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  update public.chats set verified = coalesce(value, false) where id = p_chat;
  if not found then return false; end if;
  perform public.fc_admin_log('set_chat_verified', 'chat', p_chat,
    jsonb_build_object('value', coalesce(value, false)));
  return true;
end $function$;

create or replace function public.admin_delete_chat(p_chat text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_title text; v_type text; v_messages bigint;
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;

  -- Снимок до удаления: после delete восстановить контекст будет уже нечем.
  select c.title, c.type into v_title, v_type from public.chats c where c.id = p_chat;
  if v_type is null then return false; end if;
  select count(*) into v_messages from public.messages m where m.chat_id = p_chat;

  begin
    delete from public.chats where id = p_chat;
  exception when foreign_key_violation then
    delete from public.messages where chat_id = p_chat;
    delete from public.chats where id = p_chat;
  end;

  perform public.fc_admin_log('delete_chat', 'chat', p_chat,
    jsonb_build_object('title', v_title, 'type', v_type, 'messages', v_messages));
  return true;
end $function$;

create or replace function public.admin_delete_message(p_message uuid, hard boolean default false)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_chat text; v_sender uuid; v_preview text;
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;

  select m.chat_id, m.sender_uid, left(coalesce(m.text, ''), 200)
    into v_chat, v_sender, v_preview
    from public.messages m where m.id = p_message;
  if v_chat is null then return false; end if;

  if coalesce(hard, false) then
    delete from public.messages where id = p_message;
  else
    update public.messages set deleted = true, text = '' where id = p_message;
  end if;

  perform public.fc_admin_log('delete_message', 'message', p_message::text,
    jsonb_build_object('chat_id', v_chat, 'sender_uid', v_sender, 'hard', coalesce(hard, false), 'preview', v_preview));
  return true;
end $function$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  if p_status not in ('open','resolved','dismissed') then raise exception 'Unknown status'; end if;

  update public.reports
     set status = p_status,
         resolved_by = case when p_status = 'open' then null else auth.uid() end,
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_report;

  if not found then return false; end if;

  perform public.fc_admin_log('resolve_report', 'report', p_report::text,
    jsonb_build_object('status', p_status));
  return true;
end $function$;

create or replace function public.set_perk(target uuid, perk text, value boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated public.user_perks;
begin
  if not public.fc_is_admin() then
    raise exception 'not allowed';
  end if;
  if perk not in ('is_admin', 'can_create_bots', 'premium', 'verified') then
    raise exception 'unknown perk %', perk;
  end if;
  -- Locking yourself out of the admin panel is not a recoverable mistake.
  if perk = 'is_admin' and target = auth.uid() and value = false then
    raise exception 'cannot remove your own admin';
  end if;

  insert into public.user_perks (uid, updated_by) values (target, auth.uid())
  on conflict (uid) do nothing;

  update public.user_perks
     set is_admin = case when perk = 'is_admin' then value else is_admin end,
         can_create_bots = case when perk = 'can_create_bots' then value else can_create_bots end,
         premium = case when perk = 'premium' then value else premium end,
         verified = case when perk = 'verified' then value else verified end,
         updated_at = now(),
         updated_by = auth.uid()
   where uid = target
   returning * into updated;

  -- The verified tick lives on the profile too, because that is what every
  -- chat list and header already reads.
  if perk = 'verified' then
    update public.profiles set verified = value where uid = target;
  end if;

  -- Выдача админки — самое чувствительное действие в системе, оно должно
  -- быть видно в журнале в первую очередь.
  perform public.fc_admin_log('set_perk', 'perk', target::text,
    jsonb_build_object('perk', perk, 'value', value));

  return to_jsonb(updated);
end;
$function$;

create or replace function public.set_max_bots(target uuid, value integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated public.user_perks;
begin
  if not public.fc_is_admin() then
    raise exception 'not allowed';
  end if;
  insert into public.user_perks (uid, updated_by) values (target, auth.uid())
  on conflict (uid) do nothing;
  update public.user_perks
     set max_bots = greatest(0, least(coalesce(value, 0), 50)),
         updated_at = now(),
         updated_by = auth.uid()
   where uid = target
   returning * into updated;

  perform public.fc_admin_log('set_max_bots', 'perk', target::text,
    jsonb_build_object('value', greatest(0, least(coalesce(value, 0), 50))));

  return to_jsonb(updated);
end;
$function$;

/* ── 4. Пагинация и устойчивая сортировка в списках ──────────────────────── */
-- Без вторичного ключа сортировки строки с равным last_seen / max(ts) могут
-- переставляться между страницами, и одна и та же запись попадёт дважды либо
-- не попадёт вовсе. Поэтому вместе с p_off добавлены тайбрейкеры.

drop function if exists public.admin_list_users(text, integer);
drop function if exists public.admin_list_chats(text, integer);
drop function if exists public.admin_list_reports(text, integer);
drop function if exists public.admin_search_messages(text, text, integer);

create function public.admin_list_users(q text default null::text, lim integer default 60, p_off integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
    order by p.last_seen desc nulls last, p.num_id asc
    limit greatest(1, least(coalesce(lim, 60), 200))
    offset greatest(0, coalesce(p_off, 0))
  ) t;
  return result;
end $function$;

create function public.admin_list_chats(q text default null::text, lim integer default 60, p_off integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare result jsonb; needle text := nullif(btrim(coalesce(q,'')), '');
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into result from (
    select c.id, c.type, c.title, c.username, c.emoji, c.color, c.avatar_url,
           coalesce(c.is_private,false) as is_private, coalesce(c.verified,false) as verified,
           c.owner_uid, c.member_count, coalesce(cardinality(c.member_uids), 0) as members_real,
           c.created_at, s.messages, s.last_message_at
    from public.chats c
    left join lateral (
      select count(*) as messages, max(m.ts) as last_message_at
      from public.messages m where m.chat_id = c.id
    ) s on true
    where needle is null
       or c.title ilike '%' || needle || '%'
       or c.username ilike '%' || needle || '%'
       or c.id = needle
    order by s.last_message_at desc nulls last, c.id asc
    limit greatest(1, least(coalesce(lim, 60), 200))
    offset greatest(0, coalesce(p_off, 0))
  ) t;
  return result;
end $function$;

create function public.admin_list_reports(p_status text default 'open'::text, lim integer default 60, p_off integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
    order by r.created_at desc, r.id asc
    limit greatest(1, least(coalesce(lim, 60), 200))
    offset greatest(0, coalesce(p_off, 0))
  ) t;
  return result;
end $function$;

create function public.admin_search_messages(q text default null::text, p_chat text default null::text, lim integer default 60, p_off integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
    order by m.ts desc, m.id asc
    limit greatest(1, least(coalesce(lim, 60), 200))
    offset greatest(0, coalesce(p_off, 0))
  ) t;
  return result;
end $function$;

/* ── 5. Чтение журнала ───────────────────────────────────────────────────── */

create or replace function public.admin_list_audit(
  p_action text default null::text,
  p_target text default null::text,
  lim integer default 60,
  p_off integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare result jsonb;
begin
  if not public.fc_is_admin() then raise exception 'Admin only'; end if;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into result from (
    select a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at,
           a.actor_uid, p.username as actor_username, p.name as actor_name
    from public.admin_audit a
    left join public.profiles p on p.uid = a.actor_uid
    where (p_action is null or p_action = 'all' or a.action = p_action)
      and (p_target is null or a.target_id = p_target)
    order by a.created_at desc, a.id desc
    limit greatest(1, least(coalesce(lim, 60), 200))
    offset greatest(0, coalesce(p_off, 0))
  ) t;
  return result;
end $function$;

/* ── 6. Гранты на новые сигнатуры ────────────────────────────────────────── */
-- Пересозданные функции потеряли гранты из 20260827033001, а новые получили
-- дефолтный EXECUTE TO PUBLIC. Повторяем ту же стратегию.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in (
        'admin_list_users', 'admin_list_chats', 'admin_list_reports',
        'admin_search_messages', 'admin_list_audit'
      )
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;

-- Писатель журнала не должен быть вызываем из браузера ни одной ролью клиента.
revoke execute on function public.fc_admin_log(text, text, text, jsonb) from public;
revoke execute on function public.fc_admin_log(text, text, text, jsonb) from anon;
revoke execute on function public.fc_admin_log(text, text, text, jsonb) from authenticated;

/* ── 7. directory: не показывать забаненных ──────────────────────────────── */
-- security_invoker = false здесь осознанно: каталог обязан показывать людей,
-- с которыми у тебя ещё нет общих чатов, а RLS на profiles такие строки прячет.
-- Но обходя RLS, view обязана сама фильтровать то, что показывать нельзя.
-- SELECT выдан только authenticated, у anon он отозван.

create or replace view public.directory with (security_invoker = false) as
 select p.uid::text as uid,
        case when p.is_bot then 'bot'::text else 'user'::text end as kind,
    p.num_id,
    p.username,
    p.name,
    p.emoji,
    p.color,
    coalesce(p.bio, ''::text) as bio,
    p.verified,
    null::integer as members,
        case
            when coalesce(p.settings #>> '{privacy,lastSeen}'::text[], 'everyone'::text) = 'nobody'::text then false
            else p.last_seen > (now() - '00:05:00'::interval)
        end as online,
    p.avatar_url,
        case
            when coalesce(p.settings #>> '{privacy,lastSeen}'::text[], 'everyone'::text) = 'everyone'::text then p.last_seen
            else null::timestamp with time zone
        end as last_seen
   from profiles p
  where p.banned_until is null or p.banned_until <= now()
union all
 select c.id as uid,
    c.type as kind,
    0::bigint as num_id,
    coalesce(c.username, ''::text) as username,
    c.title as name,
    c.emoji,
    c.color,
    coalesce(c.description, ''::text) as bio,
    c.verified,
    c.member_count as members,
    null::boolean as online,
    c.avatar_url,
    null::timestamp with time zone as last_seen
   from chats c
  where (c.type = any (array['group'::text, 'channel'::text])) and not coalesce(c.is_private, false);

revoke all on public.directory from anon;
grant select on public.directory to authenticated;

/* ── 8. Остаточные табличные гранты ──────────────────────────────────────── */
-- RLS без политик уже блокирует эти таблицы, но висящие гранты anon означают,
-- что одна забытая permissive-политика в будущем сразу их откроет.
-- assist_tickets хранит одноразовые токены, kiskis_actions читается только
-- через SECURITY DEFINER fc_kiskis_help().

revoke all on public.assist_tickets from anon;
revoke all on public.assist_tickets from authenticated;
revoke all on public.kiskis_actions from anon;
revoke all on public.kiskis_actions from authenticated;

comment on table public.assist_tickets is
  'Одноразовые токены поддержки. Только service_role и SECURITY DEFINER RPC (assist_ticket / redeem_assist_ticket).';
comment on table public.kiskis_actions is
  'Справочник действий /кискис. Читается только через fc_kiskis_help().';
