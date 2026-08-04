-- Список своих заготовок отдельной функцией, а не прямым запросом к таблице:
-- в клиенте есть ровно один узкий ход на сервер (rpc), и новая механика
-- укладывается в него целиком, не трогая слой бэкендов.
--
-- Функция нарочно security invoker: правило «вижу только своё» уже живёт
-- в политике таблицы, и дублировать его правами владельца незачем.
create or replace function public.my_scheduled_messages()
returns setof public.scheduled_messages
language sql
stable
set search_path = 'public'
as $fn$
  select *
    from public.scheduled_messages
   where sender_uid = auth.uid()
     and delivered_at is null
   order by send_at;
$fn$;

revoke all on function public.my_scheduled_messages() from anon;
grant execute on function public.my_scheduled_messages() to authenticated;
