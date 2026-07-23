# 💬 FemboyChat

**Тёплый, современный real-time мессенджер для РУ-сегмента.** Аналог Telegram со своим характером: вход без пароля, поиск всего и сразу, реальное время без перезагрузок и красивые многофункциональные настройки.

> Живая демка: **https://kultik1337.github.io/FemboyChat/**

---

## ✨ Возможности

- **Лендинг** с объяснением, что это и зачем.
- **Passwordless-вход** — по e-mail + @юзернейму, подтверждение одноразовым кодом (никаких паролей).
- **Числовые ID** — каждому аккаунту присваивается порядковый номер регистрации (`#9`, `#10`, …).
- **Универсальный поиск** — одно поле находит сразу людей, каналы, группы и ботов. Поиск по имени, `@юзернейму` и номеру.
- **Реальное время** — сообщения, «печатает…», статусы онлайн и отметки о прочтении прилетают мгновенно, без обновления страницы (через `BroadcastChannel` между вкладками в демо-режиме, через Supabase Realtime в проде).
- **Чаты всех типов** — личные, группы, каналы (вещание), боты, «Избранное».
- **Богатые сообщения** — ответы, реакции-эмодзи, редактирование, удаление, закрепление, пересылка, стикеры, **опросы**, **исчезающие сообщения** (таймер), простое форматирование (`**жирный**`, `*курсив*`, `` `код` ``, `~~зачёркнутый~~`, ссылки).
- **Боты** отвечают на `/команды` (встроенные FemBot, StickerBot, QuoteBot).
- **Роскошные настройки** — профиль, оформление (3 темы, акцентные цвета, обои, размер текста, скругление бабблов), приватность (режим-призрак, «был в сети», кто может писать), уведомления, чаты, язык, экспорт/очистка данных.
- **Приятные мелочи** — папки чатов, «Избранное», онбординг, звук уведомлений, крупные эмодзи, аватары-эмодзи с градиентом, косметический «FemPremium».

## 🚀 Быстрый старт

```bash
npm install
npm run dev        # http://localhost:5173
```

Другие команды:

```bash
npm run build      # прод-сборка в dist/
npm run preview    # предпросмотр прод-сборки
npm run typecheck  # проверка типов (tsc --noEmit)
npm run verify     # headless-тест ядра (LocalBackend): авторизация, поиск, real-time…
```

### Как попробовать реальное время

1. Открой приложение в **двух вкладках** (или в двух окнах браузера).
2. В каждой вкладке зарегистрируй **разный** аккаунт (сессия хранится отдельно для каждой вкладки).
3. Найди второй аккаунт через поиск и напиши — сообщения появятся в обеих вкладках мгновенно. ✨

> В демо-режиме код подтверждения показывается прямо на экране (и в консоли), так что почта не нужна.

## 🏗️ Архитектура

Стек: **Vite + React + TypeScript + Tailwind CSS + Zustand**.

Ключевая идея — **сменный бэкенд** за единым интерфейсом (`src/lib/backend/types.ts`):

| Режим | Когда используется | Что даёт |
| --- | --- | --- |
| `LocalBackend` (по умолчанию) | всегда, если не заданы ключи Supabase | Всё живёт в браузере: `localStorage` + `sessionStorage` для данных и сессии, `BroadcastChannel` — для real-time между вкладками. OTP-код показывается в UI. |
| `SupabaseBackend` (опция) | если заданы `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` | Настоящие письма с кодом (Email OTP) и синхронизация между устройствами (Supabase Realtime). |

```
src/
├─ components/        UI: landing, auth, app (sidebar/chat/…), settings
├─ lib/
│  ├─ backend/        адаптеры (types, local, supabase, factory index)
│  ├─ seed.ts         демо-сообщество (люди, боты, каналы, группы)
│  ├─ appearance.ts   применение темы/акцента через CSS-переменные
│  └─ util.ts, sound.ts, defaults.ts
├─ store/useStore.ts  Zustand-хранилище + редьюсер real-time событий
└─ types.ts           доменные типы
```

## 🌐 Production-режим (реальная почта + мультиустройство) — опционально

Демо работает без единой строчки конфигурации. Чтобы включить настоящую отправку писем и синхронизацию между устройствами, подключи **бесплатный** Supabase:

1. Создай проект на [supabase.com](https://supabase.com).
2. В **Authentication → Providers → Email** включи **Email OTP** (вход по коду).
3. Скопируй `Project URL` и `anon public key` в `.env` (см. `.env.example`):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
4. Выполни SQL-схему в **SQL Editor**:

```sql
create table profiles (
  uid uuid primary key references auth.users on delete cascade,
  num_id bigint generated always as identity,
  username text unique not null,
  name text not null,
  email text unique,
  bio text default '', emoji text default '🎀', color text default '#ff7ab8',
  status text default '', verified bool default false, is_bot bool default false,
  settings jsonb default '{}'::jsonb,
  last_seen timestamptz default now(), created_at timestamptz default now()
);
create table chats (
  id text primary key, type text not null, title text not null, username text unique,
  emoji text, color text, description text,
  member_uids uuid[] default '{}', admin_uids uuid[] default '{}', owner_uid uuid,
  verified bool default false, member_count int default 1, created_at timestamptz default now()
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text references chats on delete cascade,
  sender_uid uuid references profiles, text text default '',
  reply_to_id uuid, reactions jsonb default '[]'::jsonb, poll jsonb, sticker text,
  pinned bool default false, deleted bool default false,
  read_by_uids uuid[] default '{}', ttl int,
  edited_ts bigint, ts timestamptz default now()
);
alter table profiles enable row level security;
alter table chats enable row level security;
alter table messages enable row level security;
-- Демо-политики (упростите/ужесточите под себя):
create policy "read all" on profiles for select using (true);
create policy "self upsert" on profiles for all using (auth.uid() = uid) with check (auth.uid() = uid);
create policy "chats read" on chats for select using (true);
create policy "messages read" on messages for select using (true);
create policy "messages write" on messages for insert with check (auth.uid() = sender_uid);
-- Включите Realtime для messages в Database → Replication.
```

> Также понадобятся RPC `list_my_chats`, `open_dm`, `join_entity`, `leave_chat`, `toggle_reaction`, `toggle_pin`, `vote_poll`, `mark_read` — заготовки вызовов уже есть в `src/lib/backend/supabase.ts`.

### Про почтовый сервис

Отдельный SMTP-сервер поднимать не нужно: Supabase (и аналоги, напр. свой SMTP через их настройки) отправляет письма с кодом из коробки. Для больших объёмов подключается собственный SMTP (SendGrid/Mailgun/Yandex) в настройках Supabase Auth.

## 📦 Деплой

Задеплоено на **GitHub Pages** через GitHub Actions (`.github/workflows/deploy.yml`). При пуше выполняется сборка и публикация `dist/`. `base` в `vite.config.ts` совпадает с именем репозитория.

## 📄 Лицензия

MIT. Сделано с 💖 для РУ-сообщества.
