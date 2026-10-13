-- FemboyChat VPS Database Initialization
-- Simplified schema for self-hosted deployment

-- Расширения
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Таблица профилей пользователей
CREATE TABLE IF NOT EXISTS public.profiles (
  uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  num_id BIGSERIAL,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  bio TEXT DEFAULT '',
  emoji TEXT DEFAULT '🎀',
  color TEXT DEFAULT '#ff7ab8',
  avatar_url TEXT,
  status TEXT DEFAULT '',
  verified BOOLEAN DEFAULT false,
  is_bot BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}'::jsonb,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица чатов
CREATE TABLE IF NOT EXISTS public.chats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('dm', 'bot', 'group', 'channel', 'saved')),
  title TEXT NOT NULL,
  username TEXT UNIQUE,
  emoji TEXT DEFAULT '💬',
  color TEXT DEFAULT '#ff7ab8',
  description TEXT,
  member_uids UUID[] DEFAULT '{}',
  admin_uids UUID[] DEFAULT '{}',
  owner_uid UUID,
  verified BOOLEAN DEFAULT false,
  member_count INT DEFAULT 1,
  avatar_url TEXT,
  is_private BOOLEAN DEFAULT false,
  invite_code TEXT UNIQUE,
  pinned BOOLEAN DEFAULT false,
  muted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица сообщений
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id TEXT REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_uid UUID REFERENCES public.profiles(uid) ON DELETE SET NULL,
  text TEXT DEFAULT '',
  reply_to_id UUID,
  reactions JSONB DEFAULT '[]'::jsonb,
  poll JSONB,
  sticker TEXT,
  attachment JSONB,
  pinned BOOLEAN DEFAULT false,
  deleted BOOLEAN DEFAULT false,
  read_by_uids UUID[] DEFAULT '{}',
  ttl INT,
  edited_ts BIGINT,
  ts TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS messages_chat_ts_idx ON public.messages (chat_id, ts ASC);
CREATE INDEX IF NOT EXISTS chats_member_uids_idx ON public.chats USING gin (member_uids);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username);

-- View для публичного каталога
CREATE OR REPLACE VIEW public.directory AS
  SELECT
    p.uid::text as uid,
    CASE WHEN p.is_bot THEN 'bot' ELSE 'user' END as kind,
    p.num_id::bigint as num_id,
    p.username,
    p.name,
    p.emoji,
    p.color,
    COALESCE(p.bio, '') as bio,
    p.verified,
    NULL::int as members,
    (p.last_seen > NOW() - INTERVAL '5 minutes') as online,
    p.avatar_url
  FROM public.profiles p
  UNION ALL
  SELECT
    c.id as uid,
    c.type as kind,
    0::bigint as num_id,
    COALESCE(c.username, '') as username,
    c.title as name,
    c.emoji,
    c.color,
    COALESCE(c.description, '') as bio,
    c.verified,
    c.member_count as members,
    NULL::boolean as online,
    c.avatar_url
  FROM public.chats c
  WHERE c.type IN ('group', 'channel') AND NOT COALESCE(c.is_private, false);

-- RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Политики доступа для profiles
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);

-- Политики доступа для chats
CREATE POLICY chats_select ON public.chats FOR SELECT USING (true);

-- Политики доступа для messages
CREATE POLICY messages_select ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = messages.chat_id
  )
);

-- Права доступа
GRANT SELECT ON public.directory TO anon, authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.chats TO authenticated;
GRANT ALL ON public.messages TO authenticated;

-- Создание роли anon если её нет
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- Тестовые данные (опционально, закомментировано)
-- INSERT INTO public.profiles (uid, username, name, email, is_bot) VALUES
-- ('00000000-0000-0000-0000-000000000001', 'femboy_ai', 'FemboyAI', 'bot@femboychat.local', true);

COMMIT;
