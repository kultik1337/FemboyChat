import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Camera,
  Database,
  Ghost,
  Globe,
  LogOut,
  MessageSquare,
  Monitor,
  Palette,
  ShieldCheck,
  Smartphone,
  Smile,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  User,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Modal } from '../ui/Modal'
import { Avatar } from '../ui/Avatar'
import { EmojiGrid } from '../ui/EmojiPicker'
import { ACCENT_PRESETS } from '../../lib/defaults'
import { downscaleImage } from '../../lib/media'
import { classNames, normalizeUsername } from '../../lib/util'
import { deviceInfo, deviceKey, deviceLabel, isMobileOs } from '../../lib/device'
import type { Audience, Message, UserSettings } from '../../types'

type Tab = 'profile' | 'appearance' | 'privacy' | 'notifications' | 'chats' | 'language' | 'data' | 'about'

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Профиль', icon: User },
  { id: 'appearance', label: 'Оформление', icon: Palette },
  { id: 'privacy', label: 'Приватность', icon: ShieldCheck },
  { id: 'notifications', label: 'Уведомления', icon: Bell },
  { id: 'chats', label: 'Чаты', icon: MessageSquare },
  { id: 'language', label: 'Язык', icon: Globe },
  { id: 'data', label: 'Данные', icon: Database },
  { id: 'about', label: 'О приложении', icon: Sparkles },
]

export function Settings() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const [tab, setTab] = useState<Tab>('profile')

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Настройки" wide flush>
      <div className="flex h-full min-h-0 flex-col sm:h-[68vh] md:flex-row">
        <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] p-2 md:w-52 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={classNames(
                'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition',
                tab === t.id ? 'accent-gradient text-white' : 'text-[var(--muted)] hover:bg-[var(--panel-hover)]',
              )}
            >
              <t.icon size={17} /> {t.label}
            </button>
          ))}
        </div>
        <div className="fancy-scroll min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'privacy' && <PrivacyTab />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'chats' && <ChatsTab />}
          {tab === 'language' && <LanguageTab />}
          {tab === 'data' && <DataTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </Modal>
  )
}

// ── Profile ──
function ProfileTab() {
  const account = useStore((s) => s.account)!
  const patchProfile = useStore((s) => s.patchProfile)
  const patchSettings = useStore((s) => s.patchSettings)
  const backend = useStore((s) => s.backend)!
  const toast = useStore((s) => s.toast)
  const [name, setName] = useState(account.name)
  const [username, setUsername] = useState(account.username)
  const [bio, setBio] = useState(account.bio)
  const [status, setStatus] = useState(account.status)
  const [emoji, setEmoji] = useState(account.emoji)
  const [color, setColor] = useState(account.color)
  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl)
  const [editorOpen, setEditorOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith('image/')) return toast('Выбери картинку (jpg, png, webp, gif)', '🖼️')
    setUploading(true)
    try {
      const blob = await downscaleImage(file, 512, 0.9)
      const { url } = await backend.uploadFile('avatar', blob, file.name)
      setAvatarUrl(url)
      await patchProfile({ avatarUrl: url })
      toast('Аватарка обновлена', '📸')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось загрузить аватарку', '⚠️')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeAvatar() {
    setAvatarUrl(undefined)
    await patchProfile({ avatarUrl: undefined })
    toast('Фото убрано — снова эмодзи', '🎀')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <button onClick={() => setEditorOpen((v) => !v)} className="group relative" title="Изменить аватарку">
          <Avatar emoji={emoji} color={color} src={avatarUrl} size={76} />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
            <Camera size={22} />
          </span>
          {uploading && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-xs font-bold text-white">…</span>
          )}
        </button>
        <div>
          <div className="text-lg font-black">{name}</div>
          <div className="text-sm text-[var(--muted)]">@{username}</div>
          <div className="mt-1 inline-flex items-center gap-1 chip">ID аккаунта · #{account.numId}</div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />

      {editorOpen && (
        <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 animate-pop-in">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-primary flex-1 !py-2 text-sm">
              <Upload size={16} /> {uploading ? 'Загружаем…' : 'Загрузить фото'}
            </button>
            {avatarUrl && (
              <button onClick={removeAvatar} className="btn-ghost !py-2 text-sm text-rose-500">
                <Trash2 size={16} /> Убрать фото
              </button>
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]">
              <Smile size={13} /> ИЛИ ВЫБЕРИ ЭМОДЗИ
            </div>
            <EmojiGrid compact onPick={(e) => { setEmoji(e); toast('Не забудь нажать «Сохранить» 💾') }} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold text-[var(--muted)]">ЦВЕТ ФОНА</div>
            <div className="flex flex-wrap gap-2">
              {['#ff7ab8', '#b388ff', '#7cc4ff', '#5ad1c4', '#ffb26b', '#ff8f8f', '#8ee6a0', '#f2a2e8'].map((c) => (
                <button key={c} onClick={() => setColor(c)} className={classNames('h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--panel)]', color === c && 'ring-2 ring-[var(--accent)]')} style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
      )}

      <Field label="Имя"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
      <Field label="Юзернейм">
        <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3">
          <span className="text-[var(--muted)]">@</span>
          <input value={username} onChange={(e) => setUsername(normalizeUsername(e.target.value))} className="w-full bg-transparent px-1 py-2.5 outline-none" />
        </div>
      </Field>
      <Field label="О себе"><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} className="input resize-none" placeholder="Расскажи о себе 🎀" /></Field>
      <Field label="Статус / настроение"><input value={status} onChange={(e) => setStatus(e.target.value)} className="input" placeholder="например: 🌙 сплю днём, живу ночью" /></Field>

      <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">👑</span>
          <div>
            <div className="text-sm font-bold">FemPremium</div>
            <div className="text-xs text-[var(--muted)]">Косметика: градиентное имя, экстра-реакции</div>
          </div>
        </div>
        <Toggle value={account.settings.premium} onChange={(v) => patchSettings({ premium: v })} />
      </div>

      <button
        onClick={async () => { await patchProfile({ name, username, bio, status, emoji, color, avatarUrl }); toast('Профиль сохранён', '💖') }}
        className="btn-primary w-full"
      >
        Сохранить
      </button>
    </div>
  )
}

// ── Appearance ──
function AppearanceTab() {
  const s = useStore((st) => st.account!.settings)
  const patch = useStore((st) => st.patchSettings)
  const themes: { id: UserSettings['theme']; label: string; emoji: string }[] = [
    { id: 'auto', label: 'Как в системе', emoji: '🌗' },
    { id: 'light', label: 'Пастель', emoji: '🌸' },
    { id: 'dark', label: 'Catgirl Night', emoji: '🐈‍⬛' },
    { id: 'midnight', label: 'Programmer Socks', emoji: '🧦' },
  ]
  const walls: { id: UserSettings['wallpaper']; label: string }[] = [
    { id: 'aurora', label: 'Аврора' },
    { id: 'dots', label: 'Точки' },
    { id: 'hearts', label: 'Сердечки' },
    { id: 'plain', label: 'Гладкий' },
  ]
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-sm font-semibold">Тема</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {themes.map((t) => (
            <button key={t.id} onClick={() => patch({ theme: t.id })} className={classNames('rounded-2xl border p-3 text-center', s.theme === t.id ? 'border-[var(--accent)] ring-2 ring-[var(--ring)]' : 'border-[var(--border)]')}>
              <div className="text-2xl">{t.emoji}</div>
              <div className="mt-1 text-xs font-semibold">{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Акцентный цвет</div>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((a) => (
            <button key={a.accent} onClick={() => patch({ accent: a.accent })} className={classNames('h-9 w-9 rounded-full ring-offset-2 ring-offset-[var(--panel)]', s.accent === a.accent && 'ring-2 ring-[var(--accent)]')} style={{ background: `linear-gradient(135deg, ${a.accent}, ${a.accent2})` }} title={a.name} />
          ))}
          <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-dashed border-[var(--border)]">
            <input type="color" value={s.accent} onChange={(e) => patch({ accent: e.target.value })} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" />
          </label>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Обои чата</div>
        <div className="grid grid-cols-4 gap-2">
          {walls.map((w) => (
            <button key={w.id} onClick={() => patch({ wallpaper: w.id })} className={classNames('overflow-hidden rounded-xl border', s.wallpaper === w.id ? 'border-[var(--accent)] ring-2 ring-[var(--ring)]' : 'border-[var(--border)]')}>
              <div className={`h-12 w-full wallpaper-${w.id}`} />
              <div className="py-1 text-center text-[11px] font-semibold">{w.label}</div>
            </button>
          ))}
        </div>
      </div>

      <Slider label="Размер текста" value={s.fontScale} min={0.9} max={1.2} step={0.05} onChange={(v) => patch({ fontScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Скругление сообщений" value={s.bubbleRadius} min={6} max={26} step={1} onChange={(v) => patch({ bubbleRadius: v })} format={(v) => `${v}px`} />
      <ToggleRow label="Крупные эмодзи" desc="Одиночные эмодзи показываются большими" value={s.bigEmoji} onChange={(v) => patch({ bigEmoji: v })} />
      <ToggleRow label="Анимации" desc="Плавные переходы и эффекты" value={s.animations} onChange={(v) => patch({ animations: v })} />
      <ToggleRow label="Градиентное имя" desc="Требует FemPremium 👑" value={s.nameGradient} onChange={(v) => patch({ nameGradient: v })} />
    </div>
  )
}

// ── Privacy ──
const LAST_SEEN_OPTIONS: { id: Audience; label: string; hint: string }[] = [
  { id: 'everyone', label: 'Все', hint: 'Видно и онлайн, и точное время последнего визита.' },
  { id: 'contacts', label: 'Собеседники', hint: 'Точное время скрыто, остаётся только отметка «в сети».' },
  { id: 'nobody', label: 'Никто', hint: 'Для остальных ты всегда оффлайн — ни точки, ни времени.' },
]

/** One row of public.list_devices(). */
type Session = {
  device_key: string
  browser: string | null
  os: string | null
  standalone: boolean
  created_at: string
  last_seen: string
}

function PrivacyTab() {
  const s = useStore((st) => st.account!.settings)
  const patch = useStore((st) => st.patchSettings)
  const logout = useStore((st) => st.logout)
  const backend = useStore((st) => st.backend)!
  const toast = useStore((st) => st.toast)

  // The server reads settings.privacy.lastSeen directly. Accounts created
  // before this control existed only have the booleans, so derive from them.
  const lastSeen: Audience = s.privacy?.lastSeen ?? (s.ghostMode ? 'nobody' : s.showLastSeen ? 'everyone' : 'contacts')

  function setLastSeen(v: Audience) {
    patch({
      privacy: { ...(s.privacy ?? { lastSeen: 'everyone' }), lastSeen: v },
      showLastSeen: v === 'everyone',
      ghostMode: v === 'nobody',
    })
  }

  // Sessions live on the server; demo mode has none, so it keeps the old
  // local-only card describing just this browser.
  const hasSessions = !!backend.rpc && backend.mode !== 'local'
  const myKey = useMemo(() => deviceKey(), [])
  const local = useMemo(() => deviceInfo(), [])
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [killing, setKilling] = useState('')

  async function loadSessions() {
    if (!hasSessions) return
    const rows = await backend.rpc?.('list_devices')
    setSessions(Array.isArray(rows) ? (rows as Session[]) : [])
  }

  useEffect(() => {
    void loadSessions()
  }, [hasSessions])

  /**
   * Ending the current session is just a sign-out with a marker, so this
   * browser does not quietly reappear in the list on its next heartbeat.
   */
  async function endSession(key: string) {
    if (killing) return
    const mine = key === myKey
    if (mine && !confirm('Завершить сеанс на этом устройстве? Придётся войти заново.')) return
    setKilling(key)
    try {
      const ok = await backend.rpc?.('revoke_device', { key })
      if (ok !== true) {
        toast('Не удалось завершить сеанс — попробуй позже', '⚠️')
        return
      }
      if (mine) {
        await logout()
        location.reload()
        return
      }
      toast('Устройство отключено', '🔒')
      await loadSessions()
    } catch {
      toast('Не удалось завершить сеанс — попробуй позже', '⚠️')
    } finally {
      setKilling('')
    }
  }

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-sm font-semibold">Кто видит, когда я был(а) в сети</div>
        <div className="flex gap-2">
          {LAST_SEEN_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setLastSeen(o.id)}
              className={classNames(
                'flex-1 rounded-xl border px-2 py-2 text-sm font-semibold transition',
                lastSeen === o.id ? 'border-[var(--accent)] accent-text' : 'border-[var(--border)] text-[var(--muted)]',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[var(--muted)]">{LAST_SEEN_OPTIONS.find((o) => o.id === lastSeen)?.hint}</p>
      </div>

      <ToggleRow
        icon={<Ghost size={16} />}
        label="Режим-призрак"
        desc="Быстрый переключатель — то же самое, что «Никто» выше"
        value={lastSeen === 'nobody'}
        onChange={(v) => setLastSeen(v ? 'nobody' : 'everyone')}
      />
      <ToggleRow label="Отметки о прочтении" desc="Другие видят, что ты прочитал(а) сообщение" value={s.showReadReceipts} onChange={(v) => patch({ showReadReceipts: v })} />

      <div>
        <div className="mb-1.5 text-sm font-semibold">Кто может мне писать</div>
        <div className="flex gap-2">
          {(['everyone', 'contacts'] as const).map((o) => (
            <button key={o} onClick={() => patch({ whoCanMessage: o })} className={classNames('flex-1 rounded-xl border py-2 text-sm font-semibold', s.whoCanMessage === o ? 'border-[var(--accent)] accent-text' : 'border-[var(--border)] text-[var(--muted)]')}>
              {o === 'everyone' ? 'Все' : 'Только контакты'}
            </button>
          ))}
        </div>
      </div>

      {hasSessions ? (
        <div className="rounded-2xl border border-[var(--border)] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold">Устройства и сеансы</div>
            {sessions && <span className="chip shrink-0">{sessions.length}</span>}
          </div>

          {sessions === null && (
            <div className="mt-3 space-y-2" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-[var(--panel-2)]" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 animate-pulse rounded bg-[var(--panel-2)]" />
                    <div className="h-3 w-24 animate-pulse rounded bg-[var(--panel-2)]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {sessions?.length === 0 && (
            <p className="mt-2 text-xs text-[var(--muted)]">Список пока пуст — он заполнится в течение минуты после входа.</p>
          )}

          <div className="mt-3 space-y-2">
            {sessions?.map((d) => {
              const mine = d.device_key === myKey
              return (
                <div key={d.device_key} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--panel-2)] p-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--panel)] text-[var(--accent)]">
                      {isMobileOs(d.os) ? <Smartphone size={17} /> : <Monitor size={17} />}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{deviceLabel(d)}</div>
                      <div className="truncate text-xs text-[var(--muted)]">
                        {mine ? `Вход с ${stamp(d.created_at)}` : `Активность ${stamp(d.last_seen)}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {mine && <span className="chip">текущее</span>}
                    <button
                      onClick={() => endSession(d.device_key)}
                      disabled={!!killing}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-40"
                      title={mine ? 'Выйти на этом устройстве' : 'Отключить это устройство'}
                    >
                      {killing === d.device_key ? '…' : mine ? 'Выйти' : 'Отключить'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-2.5 text-xs text-[var(--muted)]">
            Отключённое устройство выходит из аккаунта само — в течение двух минут или сразу, как только вернётся в окно.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] p-4">
          <div className="text-sm font-bold">Устройство</div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--panel-2)] text-[var(--accent)]">
                {isMobileOs(local.os) ? <Smartphone size={17} /> : <Monitor size={17} />}
              </span>
              <div className="min-w-0">
                <div className="truncate font-semibold">{deviceLabel(local)}</div>
                <div className="text-xs text-[var(--muted)]">Демо-режим — сеансы не хранятся</div>
              </div>
            </div>
            <span className="chip shrink-0">текущее</span>
          </div>
          <button onClick={logout} className="btn-ghost mt-3 w-full !py-2 text-sm text-rose-500">
            <LogOut size={15} /> Завершить сеанс на этом устройстве
          </button>
        </div>
      )}
    </div>
  )
}

// ── Notifications ──
function NotificationsTab() {
  const s = useStore((st) => st.account!.settings)
  const patch = useStore((st) => st.patchSettings)
  const toast = useStore((st) => st.toast)
  async function requestPerm() {
    if (typeof Notification === 'undefined') return toast('Уведомления не поддерживаются')
    const p = await Notification.requestPermission()
    toast(p === 'granted' ? 'Уведомления включены 🔔' : 'Разрешение не выдано')
  }
  return (
    <div className="space-y-4">
      <ToggleRow label="Звук входящих" value={s.notifySound} onChange={(v) => patch({ notifySound: v })} />
      <ToggleRow label="Звук при отправке" desc="Тихий «поп» когда отправляешь сообщение" value={s.sendSound} onChange={(v) => patch({ sendSound: v })} />
      <ToggleRow label="Показывать превью" desc="Текст сообщения в системном уведомлении" value={s.notifyPreview} onChange={(v) => patch({ notifyPreview: v })} />
      <button onClick={requestPerm} className="btn-ghost w-full">Разрешить браузерные уведомления</button>
    </div>
  )
}

// ── Chats ──
function ChatsTab() {
  const s = useStore((st) => st.account!.settings)
  const patch = useStore((st) => st.patchSettings)
  return (
    <div className="space-y-4">
      <ToggleRow label="Enter отправляет сообщение" desc="Иначе Enter — перенос строки, отправка по кнопке" value={s.enterToSend} onChange={(v) => patch({ enterToSend: v })} />
      <ToggleRow label="Смайлы-текст → эмодзи" desc="Автозамена :) <3 :3 xD uwu на эмодзи при отправке" value={s.emoticons} onChange={(v) => patch({ emoticons: v })} />
      <div className="rounded-2xl border border-[var(--border)] p-4 text-sm">
        <div className="font-bold">Форматирование</div>
        <div className="mt-1 text-[var(--muted)]">В сообщениях работают <b>**жирный**</b>, <i>*курсив*</i>, <code className="rich-code">`код`</code>, ~~зачёркнутый~~, <span className="spoiler revealed">||спойлер||</span>, @упоминания и ссылки.</div>
        <div className="mt-2 text-[var(--muted)]">В каналах дополнительно: заголовки <code className="rich-code">#</code>, цитаты <code className="rich-code">&gt;</code>, списки и разделители <code className="rich-code">---</code>.</div>
      </div>
      <div className="rounded-2xl border border-[var(--border)] p-4 text-sm">
        <div className="font-bold">Команды</div>
        <div className="mt-1 text-[var(--muted)]">Начни сообщение с <code className="rich-code">/</code> — доступны <b>/me</b>, <b>/shrug</b>, <b>/roll</b>, <b>/flip</b>, <b>/8ball</b>, <b>/love</b>, <b>/hug</b> и другие.</div>
      </div>
    </div>
  )
}

// ── Language ──
function LanguageTab() {
  const s = useStore((st) => st.account!.settings)
  const patch = useStore((st) => st.patchSettings)
  return (
    <div className="space-y-2">
      {(['ru', 'en'] as const).map((l) => (
        <button key={l} onClick={() => patch({ language: l })} className={classNames('flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left', s.language === l ? 'border-[var(--accent)]' : 'border-[var(--border)]')}>
          <span className="font-semibold">{l === 'ru' ? '🇷🇺 Русский' : '🇬🇧 English (beta)'}</span>
          {s.language === l && <span className="accent-text font-bold">✓</span>}
        </button>
      ))}
      <p className="pt-2 text-xs text-[var(--muted)]">Интерфейс полностью локализован на русский. Английский — в процессе.</p>
    </div>
  )
}

// ── Data ──
function DataTab() {
  const account = useStore((st) => st.account)!
  const chats = useStore((st) => st.chats)
  const backend = useStore((st) => st.backend)!
  const logout = useStore((st) => st.logout)
  const toast = useStore((st) => st.toast)
  const [busy, setBusy] = useState('')
  const [wipeOpen, setWipeOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')

  // Deleting a server account needs a server. In demo mode there is nothing
  // to delete beyond the local storage the button below already clears.
  const canDelete = !!backend.rpc && backend.mode !== 'local'
  const armed = confirmName.trim().toLowerCase().replace(/^@/, '') === account.username.toLowerCase()

  /** Real export: profile + every chat this account can read + local prefs. */
  async function exportData() {
    if (busy) return
    try {
      const conversations: unknown[] = []
      for (let i = 0; i < chats.length; i++) {
        const c = chats[i]
        setBusy(`Собираем чат ${i + 1} из ${chats.length}…`)
        let history: Message[] = []
        try {
          history = await backend.listMessages(c.id, { limit: 1000 })
        } catch {
          history = []
        }
        conversations.push({
          id: c.id,
          type: c.type,
          title: c.title,
          memberUids: c.memberUids,
          messageCount: history.length,
          messages: history.map((m) => ({
            id: m.id,
            senderUid: m.senderUid,
            text: m.text,
            sentAt: new Date(m.ts).toISOString(),
            editedAt: m.editedTs ? new Date(m.editedTs).toISOString() : undefined,
            replyToId: m.replyToId,
            sticker: m.sticker,
            attachment: m.attachment,
            reactions: m.reactions,
            deleted: m.deleted || undefined,
          })),
        })
      }

      setBusy('Формируем файл…')
      const localPreferences: Record<string, unknown> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!
        if (k.startsWith('fc:')) localPreferences[k] = localStorage.getItem(k)
      }

      const dump = {
        format: 'femboychat-export/2',
        exportedAt: new Date().toISOString(),
        account: {
          uid: account.uid,
          numId: account.numId,
          username: account.username,
          name: account.name,
          email: account.email,
          bio: account.bio,
          status: account.status,
          createdAt: new Date(account.createdAt).toISOString(),
          settings: account.settings,
        },
        chatCount: conversations.length,
        conversations,
        localPreferences,
      }

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `femboychat-${account.username}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(href)
      toast('Данные выгружены', '📦')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось собрать экспорт', '⚠️')
    } finally {
      setBusy('')
    }
  }

  function clearLocal() {
    if (!confirm('Очистить локальные данные на этом устройстве? Аккаунт и переписка на сервере останутся на месте.')) return
    Object.keys(localStorage).filter((k) => k.startsWith('fc:')).forEach((k) => localStorage.removeItem(k))
    logout()
    location.reload()
  }

  /**
   * Point of no return. The server does the work in one transaction; only if it
   * confirms do we wipe local traces and end the session. Treating a failure as
   * success here would log someone out of an account that still exists.
   */
  async function deleteAccount() {
    if (!armed || busy) return
    setBusy('Удаляем аккаунт…')
    try {
      const ok = await backend.rpc?.('delete_account')
      if (ok !== true) {
        toast('Не удалось удалить аккаунт. Ничего не изменилось — попробуй позже', '⚠️')
        return
      }
      Object.keys(localStorage).filter((k) => k.startsWith('fc:')).forEach((k) => localStorage.removeItem(k))
      try {
        await logout()
      } catch {
        /* the credentials are already gone; sign-out failing is fine */
      }
      location.reload()
    } catch {
      toast('Не удалось удалить аккаунт. Ничего не изменилось — попробуй позже', '⚠️')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={exportData} disabled={!!busy} className="btn-ghost w-full">
        📦 {busy || 'Экспортировать мои данные (JSON)'}
      </button>
      <p className="text-xs text-[var(--muted)]">В файл попадают профиль, настройки и история всех чатов, к которым у тебя есть доступ — до 1000 сообщений на чат.</p>
      <button onClick={clearLocal} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300/40 py-2.5 font-semibold text-rose-500 hover:bg-rose-500/10">🗑️ Очистить данные на этом устройстве</button>

      {canDelete && (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/[0.04] p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-500">
            <TriangleAlert size={16} /> Удалить аккаунт навсегда
          </div>
          {!wipeOpen ? (
            <>
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Удаляет профиль, все твои сообщения и выводит из всех групп и каналов. Отменить нельзя. Почту потом можно будет использовать снова.
              </p>
              <button onClick={() => setWipeOpen(true)} className="mt-3 w-full rounded-xl border border-rose-300/40 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-500/10">
                Продолжить…
              </button>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Сначала сделай экспорт — после удаления восстановить переписку будет неоткуда. Затем введи свой юзернейм <b>@{account.username}</b> для подтверждения.
              </p>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={`@${account.username}`}
                autoComplete="off"
                className="input mt-2.5"
              />
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => { setWipeOpen(false); setConfirmName('') }}
                  className="btn-ghost flex-1 !py-2 text-sm"
                >
                  Отмена
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={!armed || !!busy}
                  className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-bold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy || 'Удалить навсегда'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── About ──
function AboutTab() {
  const logout = useStore((st) => st.logout)
  const mode = useStore((st) => st.mode)
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl accent-gradient text-3xl text-white">💬</div>
        <div className="text-lg font-black">Femboy<span className="accent-text">Chat</span></div>
        <div className="text-xs text-[var(--muted)]">Версия 0.7.1 · режим: {mode === 'local' ? 'демо (локальный)' : 'Supabase'}</div>
        <p className="max-w-xs text-sm text-[var(--muted)]">Тёплый real-time мессенджер для РУ-сообщества. Сделано с 💖</p>
      </div>
      <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300/40 py-2.5 font-semibold text-rose-500 hover:bg-rose-500/10">
        <LogOut size={18} /> Выйти из аккаунта
      </button>
    </div>
  )
}

// ── shared controls ──
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  )
}
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={classNames('relative h-6 w-11 shrink-0 rounded-full transition', value ? 'accent-gradient' : 'bg-[var(--border)]')}>
      <span className={classNames('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', value ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}
function ToggleRow({ label, desc, value, onChange, icon }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <div className="text-sm font-semibold">{label}</div>
          {desc && <div className="text-xs text-[var(--muted)]">{desc}</div>}
        </div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}
function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm font-semibold">
        <span>{label}</span>
        <span className="text-[var(--muted)]">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-[var(--accent)]" />
    </div>
  )
}
