import { useState } from 'react'
import {
  Bell,
  Database,
  Ghost,
  Globe,
  LogOut,
  MessageSquare,
  Palette,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Modal } from '../ui/Modal'
import { Avatar } from '../ui/Avatar'
import { EmojiPicker } from '../ui/EmojiPicker'
import { ACCENT_PRESETS } from '../../lib/defaults'
import { classNames, normalizeUsername } from '../../lib/util'
import type { UserSettings } from '../../types'

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
      <div className="flex h-[68vh] min-h-0 flex-col md:flex-row">
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
  const toast = useStore((s) => s.toast)
  const [name, setName] = useState(account.name)
  const [username, setUsername] = useState(account.username)
  const [bio, setBio] = useState(account.bio)
  const [status, setStatus] = useState(account.status)
  const [emoji, setEmoji] = useState(account.emoji)
  const [color, setColor] = useState(account.color)
  const [picker, setPicker] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative">
          <button onClick={() => setPicker((v) => !v)}><Avatar emoji={emoji} color={color} size={76} /></button>
          {picker && <EmojiPicker onPick={(e) => { setEmoji(e); setPicker(false) }} onClose={() => setPicker(false)} />}
        </div>
        <div>
          <div className="text-lg font-black">{name}</div>
          <div className="text-sm text-[var(--muted)]">@{username}</div>
          <div className="mt-1 inline-flex items-center gap-1 chip">ID аккаунта · #{account.numId}</div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-semibold">Цвет аватара</div>
        <div className="flex flex-wrap gap-2">
          {['#ff7ab8', '#b388ff', '#7cc4ff', '#5ad1c4', '#ffb26b', '#ff8f8f', '#8ee6a0', '#f2a2e8'].map((c) => (
            <button key={c} onClick={() => setColor(c)} className={classNames('h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--panel)]', color === c && 'ring-2 ring-[var(--accent)]')} style={{ background: c }} />
          ))}
        </div>
      </div>

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
        onClick={async () => { await patchProfile({ name, username, bio, status, emoji, color }); toast('Профиль сохранён', '💖') }}
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
        <div className="grid grid-cols-3 gap-2">
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
function PrivacyTab() {
  const s = useStore((st) => st.account!.settings)
  const patch = useStore((st) => st.patchSettings)
  return (
    <div className="space-y-4">
      <ToggleRow icon={<Ghost size={16} />} label="Режим-призрак" desc="Скрывает твой онлайн-статус от других" value={s.ghostMode} onChange={(v) => patch({ ghostMode: v })} />
      <ToggleRow label="Показывать «был(а) в сети»" value={s.showLastSeen} onChange={(v) => patch({ showLastSeen: v })} />
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
      <div className="rounded-2xl border border-[var(--border)] p-4">
        <div className="text-sm font-bold">Активные сессии</div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <div>
            <div className="font-semibold">Этот браузер · текущая</div>
            <div className="text-xs text-[var(--muted)]">Веб · только что</div>
          </div>
          <span className="chip">активна</span>
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--border)] p-4 text-sm text-[var(--muted)]">
        🔐 Двухэтапная проверка и чёрный список — в разработке.
      </div>
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
      <ToggleRow label="Звук сообщений" value={s.notifySound} onChange={(v) => patch({ notifySound: v })} />
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
      <div className="rounded-2xl border border-[var(--border)] p-4 text-sm">
        <div className="font-bold">Форматирование</div>
        <div className="mt-1 text-[var(--muted)]">В сообщениях работают <b>**жирный**</b>, <i>*курсив*</i>, <code className="rich-code">`код`</code>, ~~зачёркнутый~~ и ссылки.</div>
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
  const logout = useStore((st) => st.logout)
  const toast = useStore((st) => st.toast)
  function exportData() {
    const dump: Record<string, unknown> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith('fc:')) dump[k] = localStorage.getItem(k)
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'femboychat-data.json'
    a.click()
    URL.revokeObjectURL(url)
    toast('Данные выгружены', '📦')
  }
  function clearAll() {
    if (!confirm('Удалить все локальные данные FemboyChat? Это выйдет из аккаунта.')) return
    Object.keys(localStorage).filter((k) => k.startsWith('fc:')).forEach((k) => localStorage.removeItem(k))
    logout()
    location.reload()
  }
  return (
    <div className="space-y-3">
      <button onClick={exportData} className="btn-ghost w-full">📦 Экспортировать мои данные (JSON)</button>
      <button onClick={clearAll} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300/40 py-2.5 font-semibold text-rose-500 hover:bg-rose-500/10">🗑️ Очистить локальные данные</button>
      <p className="text-xs text-[var(--muted)]">В демо-режиме все данные хранятся только в этом браузере и никуда не отправляются.</p>
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
        <div className="text-xs text-[var(--muted)]">Версия 0.1.0 · режим: {mode === 'local' ? 'демо (локальный)' : 'Supabase'}</div>
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
