-- До этой миграции практически любая функция схемы public была вызываема через
-- /rest/v1/rpc/ ролью anon (дефолтный GRANT ... TO PUBLIC в PostgreSQL), включая
-- триггерные и внутренние SECURITY DEFINER функции.
-- Стратегия: сохранить доступ для authenticated, забрать у public/anon,
-- а внутренние функции закрыть совсем.

-- 1. Сначала закрепляем текущие эффективные права за authenticated,
--    чтобы revoke от public ничего не сломал в клиенте.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;

-- 2. Внутренние и триггерные функции не должны вызываться из браузера вообще.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'fc_push_notify', 'fc_block_guard', 'fc_group_defaults', 'fc_trigger_femboy',
        'fc_trigger_kiskis', 'fc_sync_comment_count', 'fc_create_profile_for_new_user',
        'rls_auto_enable'
      )
  loop
    execute format('revoke execute on function %s from authenticated', r.sig);
  end loop;
end $$;

-- 3. Единственное исключение: проверка свободного юзернейма нужна до входа.
grant execute on function public.username_available(text) to anon;
