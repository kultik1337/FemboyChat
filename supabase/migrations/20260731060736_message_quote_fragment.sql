-- The exact fragment the author highlighted before replying. Null for an
-- ordinary reply, which quotes the whole message by definition.
alter table public.messages add column if not exists quote text;
