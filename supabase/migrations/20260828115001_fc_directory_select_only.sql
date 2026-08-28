-- Вью directory — только для чтения.
-- До этого у authenticated были все права (arwdDxtm), унаследованные с создания вьюшки
-- (create or replace view сохраняет ACL, поэтому предыдущая миграция их не сбросила).
-- UNION ALL вью не updatable, так что запись всё равно падала, но права должны отражать намерение.
revoke all on public.directory from anon;
revoke all on public.directory from authenticated;
grant select on public.directory to authenticated;
