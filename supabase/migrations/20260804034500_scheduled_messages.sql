-- Отложенная отправка.
--
-- Сообщение ждёт своего времени на сервере, а не в открытой вкладке: таймер
-- в браузере умирает вместе с вкладкой, а смысл отложенного сообщения ровно в том,
-- чтобы оно ушло, когда автор спит.

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references public.chats(id) on delete cascade,
  sender_uid uuid not null references public.profiles(uid) on delete cascade,
  text text not null default '',
  attachment jsonb,
  sticker text,
  reply_to_id uuid references public.messages(id) on delete set null,
  ttl integer,
  send_at timestamptz not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  message_id uuid references public.messages(id) on delete set null,
  error text,
  constraint scheduled_messages_not_empty check (
    length(coalesce(text, '')) > 0 or attachment is not null or sticker is not null
  ),
  constraint scheduled_messages_ttl_sane check (ttl is null or (ttl > 0 and ttl <= 604800))
);

alter table public.scheduled_messages enable row level security;

-- Видеть свои заготовки можно, писать в таблицу напрямую — нет. Иначе любой
-- мог бы запланировать сообщение в чат, где его нет, и обойти правила вставки
-- в messages через черный ход.
drop policy if exists scheduled_messages_own on public.scheduled_messages;
create policy scheduled_messages_own on public.scheduled_messages
  for select using (sender_uid = auth.uid());

-- Частичный индекс: доставщик бегает каждую минуту и должен смотреть только
-- на то, что ещё не ушло, а не на всю историю отправленных.
create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages (send_at) where delivered_at is null;
create index if not exists scheduled_messages_owner_idx
  on public.scheduled_messages (sender_uid, send_at);

-- Право писать в чат проверяется дважды: при планировании и снова при
-- отправке. Между ними могут пройти сутки, за которые автора вполне могли
-- выгнать из группы или разжаловать в канале.
create or replace function public.fc_can_schedule_in_chat(p_chat_id text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and p_uid = any (c.member_uids)
      and (c.type <> 'channel' or p_uid = any (c.admin_uids) or c.owner_uid = p_uid)
  );
$fn$;

create or replace function public.schedule_message(
  p_chat_id text,
  p_send_at timestamptz,
  p_text text default '',
  p_attachment jsonb default null,
  p_sticker text default null,
  p_reply_to_id uuid default null,
  p_ttl integer default null
)
returns public.scheduled_messages
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  me uuid := auth.uid();
  rec public.scheduled_messages;
  pending integer;
begin
  if me is null then
    raise exception 'Нужно войти в аккаунт';
  end if;

  -- Нижняя граница — не придирка: доставщик просыпается раз в минуту, и
  -- «отложить на пять секунд» выглядело бы просто как зависшая отправка.
  if p_send_at <= now() + interval '20 seconds' then
    raise exception 'Выберите время хотя бы на минуту вперёд';
  end if;
  if p_send_at > now() + interval '365 days' then
    raise exception 'Максимум — год вперёд';
  end if;

  if not public.fc_can_schedule_in_chat(p_chat_id, me) then
    raise exception 'Здесь нельзя писать';
  end if;

  select count(*) into pending
    from public.scheduled_messages
   where sender_uid = me and delivered_at is null;
  if pending >= 100 then
    raise exception 'Слишком много отложенных сообщений: максимум 100';
  end if;

  insert into public.scheduled_messages
    (chat_id, sender_uid, text, attachment, sticker, reply_to_id, ttl, send_at)
  values
    (p_chat_id, me, coalesce(p_text, ''), p_attachment, p_sticker, p_reply_to_id, p_ttl, p_send_at)
  returning * into rec;

  return rec;
end;
$fn$;

-- Отмена возможна только до отправки: после — это уже обычное сообщение
-- и удаляется так же, как любое другое.
create or replace function public.cancel_scheduled_message(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  gone integer;
begin
  delete from public.scheduled_messages
   where id = p_id
     and sender_uid = auth.uid()
     and delivered_at is null;
  get diagnostics gone = row_count;
  return gone > 0;
end;
$fn$;

-- Сама доставка. Неудача одного сообщения не должна ронять остальные,
-- поэтому каждая вставка идёт в своём блоке с перехватом ошибки, а причина
-- сохраняется рядом — иначе сообщение исчезало бы молча.
create or replace function public.fc_deliver_scheduled_messages()
returns integer
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  d record;
  m_id uuid;
  sent integer := 0;
begin
  for d in
    select * from public.scheduled_messages
     where delivered_at is null and send_at <= now()
     order by send_at
     limit 200
     for update skip locked
  loop
    if not public.fc_can_schedule_in_chat(d.chat_id, d.sender_uid) then
      update public.scheduled_messages
         set delivered_at = now(),
             error = 'Не отправлено: к моменту отправки права на чат уже не было'
       where id = d.id;
      continue;
    end if;

    begin
      insert into public.messages
        (chat_id, sender_uid, text, attachment, sticker, reply_to_id, ttl)
      values
        (d.chat_id, d.sender_uid, d.text, d.attachment, d.sticker, d.reply_to_id, d.ttl)
      returning id into m_id;

      update public.scheduled_messages
         set delivered_at = now(), message_id = m_id, error = null
       where id = d.id;
      sent := sent + 1;
    exception when others then
      update public.scheduled_messages
         set delivered_at = now(), error = left(sqlerrm, 300)
       where id = d.id;
    end;
  end loop;

  return sent;
end;
$fn$;

-- Доставщик нужен только расписанию: клиент, умеющий его вызвать, смог бы
-- отправлять чужие заготовки раньше срока.
revoke all on function public.fc_deliver_scheduled_messages() from public;
revoke all on function public.fc_deliver_scheduled_messages() from anon;
revoke all on function public.fc_deliver_scheduled_messages() from authenticated;

revoke all on function public.fc_can_schedule_in_chat(text, uuid) from anon;
revoke all on function public.schedule_message(text, timestamptz, text, jsonb, text, uuid, integer) from anon;
revoke all on function public.cancel_scheduled_message(uuid) from anon;
grant execute on function public.schedule_message(text, timestamptz, text, jsonb, text, uuid, integer) to authenticated;
grant execute on function public.cancel_scheduled_message(uuid) to authenticated;

revoke all on table public.scheduled_messages from anon;
grant select on table public.scheduled_messages to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'fc-deliver-scheduled-messages';
select cron.schedule('fc-deliver-scheduled-messages', '* * * * *', $job$select public.fc_deliver_scheduled_messages()$job$);
