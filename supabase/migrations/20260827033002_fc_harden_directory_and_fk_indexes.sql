-- directory — SECURITY DEFINER view с профилями всех людей: закрыть от анонимов.
-- security_invoker сознательно не включаем: RLS на profiles пускает только к себе,
-- к собеседникам и к ботам, а поиск людей должен видеть всех — с безопасным
-- набором колонок, который уже зашит во view.
revoke select on public.directory from anon;
grant select on public.directory to authenticated;

-- Индексы на внешние ключи без покрытия (линт unindexed_foreign_keys).
create index if not exists chat_prefs_chat_id_idx on public.chat_prefs(chat_id);
create index if not exists message_views_uid_idx on public.message_views(uid);
create index if not exists messages_forwarded_from_idx on public.messages(forwarded_from);
create index if not exists messages_sender_uid_idx on public.messages(sender_uid);
create index if not exists scheduled_messages_chat_id_idx on public.scheduled_messages(chat_id);
create index if not exists scheduled_messages_message_id_idx on public.scheduled_messages(message_id);
create index if not exists scheduled_messages_reply_to_id_idx on public.scheduled_messages(reply_to_id);
