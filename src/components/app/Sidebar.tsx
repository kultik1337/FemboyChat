import { useMemo, useState } from 'react'
import { Menu, Pencil, Pin, Search, Settings, VolumeX } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { chatCounterpart, usePeople } from './people'
import { SearchResults } from './SearchResults'
import { useActions } from './useActions'
import { openContextMenu } from '../ui/ContextMenu'
import { classNames, timeShort } from '../../lib/util'
import type { Chat } from '../../types'

const FOLDERS = [
  { id: 'all', label: 'Все' },
  { id: 'dm', label: 'Личные' },
  { id: 'group', label: 'Группы' },
  { id: 'channel', label: 'Каналы' },
] as const

export function Sidebar() {
  const account = useStore((s) => s.account)!
  const chats = useStore((s) => s.chats)
  const activeChatId = useStore((s) => s.activeChatId)
  const openChat = useStore((s) => s.openChat)
  const unread = useStore((s) => s.unread)
  const previews = useStore((s) => s.previews)
  const searchQuery = useStore((s) => s.searchQuery)
  const search = useStore((s) => s.search)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setNewChatKind = useStore((s) => s.setNewChatKind)
  const logout = useStore((s) => s.logout)
  const typing = useStore((s) => s.typing)
  const presence = useStore((s) => s.presence)
  const now = useStore((s) => s.now)
  const { resolve } = usePeople()
  const { chatMenu } = useActions()

  const [folder, setFolder] = useState<(typeof FOLDERS)[number]['id']>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  const searching = searchQuery.trim().length > 0

  const filtered = useMemo(() => {
    if (folder === 'all') return chats
    if (folder === 'dm') return chats.filter((c) => c.type === 'dm' || c.type === 'bot' || c.type === 'saved')
    return chats.filter((c) => c.type === folder)
  }, [chats, folder])

  function chatVisual(c: Chat) {
    if (c.type === 'dm' || c.type === 'bot') {
      const other = chatCounterpart(c, account.uid)
      const p = other ? resolve(other) : null
      return { title: p?.name ?? c.title, emoji: p?.emoji ?? c.emoji, color: p?.color ?? c.color, verified: p?.verified }
    }
    return { title: c.title, emoji: c.emoji, color: c.color, verified: c.verified }
  }

  function previewText(c: Chat) {
    const typers = Object.values(typing[c.id] ?? {}).filter((t) => now - t.at < 4000)
    if (typers.length) return { text: c.type === 'group' ? `${typers[0].name} печатает…` : 'печатает…', typing: true }
    const p = previews[c.id]
    if (!p) return { text: c.description ?? 'Нет сообщений', typing: false }
    if (p.deleted) return { text: 'сообщение удалено', typing: false }
    const prefix = c.type === 'group' && p.senderUid !== account.uid ? `${resolve(p.senderUid).name.split(' ')[0]}: ` : ''
    return { text: prefix + (p.sticker ? `${p.sticker} стикер` : p.text || 'вложение'), typing: false }
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
            <Menu size={20} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-12 z-30 w-56 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
                <MenuItem onClick={() => { setMenuOpen(false); setNewChatKind('group') }}>👥 Новая группа</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); setNewChatKind('channel') }}>📣 Новый канал</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); setSettingsOpen(true) }}>⚙️ Настройки</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); logout() }}>🚪 Выйти / сменить аккаунт</MenuItem>
              </div>
            </>
          )}
        </div>

        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={searchQuery}
            onChange={(e) => search(e.target.value)}
            placeholder="Поиск: люди, каналы, боты…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--panel-2)] py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
        <button onClick={() => setSettingsOpen(true)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
          <Settings size={19} />
        </button>
      </div>

      {searching ? (
        <SearchResults />
      ) : (
        <>
          {/* folders */}
          <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
            {FOLDERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFolder(f.id)}
                className={classNames(
                  'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition',
                  folder === f.id ? 'accent-gradient text-white' : 'text-[var(--muted)] hover:bg-[var(--panel-hover)]',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* chat list */}
          <div className="fancy-scroll flex-1 overflow-y-auto px-2 pb-3">
            {filtered.length === 0 && (
              <div className="mt-10 px-6 text-center text-sm text-[var(--muted)]">
                Пока пусто. Найди кого-нибудь через поиск ✨
              </div>
            )}
            {filtered.map((c) => {
              const v = chatVisual(c)
              const other = chatCounterpart(c, account.uid)
              const online = other ? presence[other]?.online : undefined
              const pv = previewText(c)
              const count = unread[c.id] ?? 0
              const active = c.id === activeChatId
              return (
                <button
                  key={c.id}
                  onClick={() => openChat(c.id)}
                  onContextMenu={(e) => openContextMenu(e, chatMenu(c))}
                  className={classNames(
                    'flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition',
                    active ? 'bg-[var(--panel-hover)]' : 'hover:bg-[var(--panel-hover)]',
                  )}
                >
                  <Avatar emoji={c.type === 'saved' ? '🔖' : v.emoji} color={v.color} size={50} online={c.type === 'dm' || c.type === 'bot' ? !!online : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate font-semibold">{c.type === 'saved' ? 'Избранное' : v.title}</span>
                      {v.verified && <span className="text-[var(--accent)]" title="verified">✔</span>}
                      {c.pinned && <Pin size={12} className="text-[var(--muted)]" />}
                      {c.muted && <VolumeX size={12} className="text-[var(--muted)]" />}
                      <span className="ml-auto shrink-0 text-[11px] text-[var(--muted)]">
                        {previews[c.id] ? timeShort(previews[c.id].ts) : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={classNames('truncate text-sm', pv.typing ? 'text-[var(--accent)]' : 'text-[var(--muted)]')}>{pv.text}</span>
                      {count > 0 && (
                        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full accent-gradient px-1.5 text-[11px] font-bold text-white">
                          {count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* profile footer */}
      <button
        onClick={() => setSettingsOpen(true)}
        onContextMenu={(e) => openContextMenu(e, [{ label: 'Настройки', onClick: () => setSettingsOpen(true) }, { label: 'Выйти / сменить аккаунт', danger: true, onClick: () => logout() }])}
        className="flex items-center gap-3 border-t border-[var(--border)] px-3 py-3 text-left hover:bg-[var(--panel-hover)]"
      >
        <Avatar emoji={account.emoji} color={account.color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{account.name}</div>
          <div className="truncate text-xs text-[var(--muted)]">@{account.username} · #{account.numId}</div>
        </div>
        <Pencil size={16} className="text-[var(--muted)]" />
      </button>
    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-[var(--panel-hover)]">
      {children}
    </button>
  )
}
