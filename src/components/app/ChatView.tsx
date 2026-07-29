import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ChevronDown, ChevronUp, Info, Paperclip, Pin, Search, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { Logo } from '../ui/Logo'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'
import { chatCounterpart, usePeople } from './people'
import { useActions } from './useActions'
import { openContextMenu } from '../ui/ContextMenu'
import { attachmentLabel } from '../../lib/media'
import { classNames, dayLabel, lastSeenLabel, plainText } from '../../lib/util'

export function ChatView() {
  const account = useStore((s) => s.account)!
  const activeChatId = useStore((s) => s.activeChatId)
  const chats = useStore((s) => s.chats)
  const messages = useStore((s) => s.messages)
  const typing = useStore((s) => s.typing)
  const presence = useStore((s) => s.presence)
  const now = useStore((s) => s.now)
  const setRightPanel = useStore((s) => s.setRightPanel)
  const setProfileUid = useStore((s) => s.setProfileUid)
  const openChat = useStore((s) => s.openChat)
  const { resolve } = usePeople()
  const { chatMenu, personMenu } = useActions()

  const chat = chats.find((c) => c.id === activeChatId) ?? null
  const msgs = activeChatId ? messages[activeChatId] ?? [] : []
  const scroller = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const openedAt = useRef(Date.now())
  const [atBottom, setAtBottom] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  const addPendingFiles = useStore((s) => s.addPendingFiles)
  // «Новые сообщения» divider: freeze the first-unread timestamp per chat visit.
  const unreadMark = useRef<{ chatId: string; ts: number | null }>({ chatId: '', ts: null })
  const wallpaper = account.settings.wallpaper

  useEffect(() => {
    openedAt.current = Date.now()
    setSearchOpen(false)
    setQuery('')
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
    atBottomRef.current = true
    setAtBottom(true)
  }, [activeChatId])

  useEffect(() => {
    const el = scroller.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [msgs.length])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90
    atBottomRef.current = bottom
    setAtBottom(bottom)
  }

  function scrollToBottom() {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('msg-flash')
    void el.offsetWidth
    el.classList.add('msg-flash')
    setTimeout(() => el.classList.remove('msg-flash'), 1500)
  }

  function onScrollerClick(e: React.MouseEvent) {
    const invite = (e.target as HTMLElement).closest('a.invite-link')
    if (invite) {
      // Invite links join the chat right here instead of opening a new tab.
      e.preventDefault()
      const code = invite.getAttribute('data-invite')
      if (code) void useStore.getState().joinInvite(code)
      return
    }
    const t = (e.target as HTMLElement).closest('.spoiler')
    if (t) t.classList.toggle('revealed')
  }

  const visibleMsgs = useMemo(
    () => msgs.filter((m) => !(m.ttl && now > m.ts + m.ttl * 1000 && m.senderUid !== account.uid) || !m.ttl),
    [msgs, now, account.uid],
  )
  const pinned = useMemo(() => msgs.filter((m) => m.pinned && !m.deleted), [msgs])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as string[]
    return msgs.filter((m) => !m.deleted && m.text.toLowerCase().includes(q)).map((m) => m.id)
  }, [query, msgs])

  useEffect(() => {
    if (!matches.length) return
    const idx = Math.min(matchIdx, matches.length - 1)
    jumpTo(matches[matches.length - 1 - idx])
  }, [matches, matchIdx])

  if (!chat) return <EmptyState />

  if (unreadMark.current.chatId !== chat.id && msgs.length) {
    const first = msgs.find((m) => m.senderUid !== account.uid && !m.system && !m.readByUids.includes(account.uid))
    unreadMark.current = { chatId: chat.id, ts: first ? first.ts : null }
  }

  const counterpartUid = chatCounterpart(chat, account.uid)
  const counterpart = counterpartUid ? resolve(counterpartUid) : null
  const isChannel = chat.type === 'channel'
  const isAdmin = chat.adminUids.includes(account.uid)
  const canPost = !isChannel || isAdmin

  const typers = Object.entries(typing[chat.id] ?? {}).filter(([uid, t]) => uid !== account.uid && now - t.at < 4000)

  function subtitle() {
    if (typers.length) return { text: chat!.type === 'group' ? `${typers.map((t) => t[1].name.split(' ')[0]).join(', ')} печатает…` : 'печатает…', accent: true }
    if (chat!.type === 'group') {
      const online = chat!.memberUids.filter((u) => u !== account.uid && presence[u]?.online).length
      return { text: `${chat!.memberCount ?? chat!.memberUids.length} участников${online > 0 ? ` · ${online} в сети` : ''}`, accent: online > 0 }
    }
    if (chat!.type === 'channel') return { text: `${(chat!.memberCount ?? 0).toLocaleString('ru-RU')} подписчиков`, accent: false }
    if (chat!.type === 'saved') return { text: 'ваши личные заметки', accent: false }
    if (counterpartUid) {
      const p = presence[counterpartUid]
      const online = p?.online ?? false
      return { text: resolve(counterpartUid).isBot ? 'бот' : lastSeenLabel(p?.lastSeen ?? Date.now(), online), accent: online }
    }
    return { text: '', accent: false }
  }
  const sub = subtitle()

  const headerVisual =
    chat.type === 'saved'
      ? { title: 'Избранное', emoji: '🔖', color: '#7cc4ff', avatarUrl: undefined }
      : counterpart
      ? { title: counterpart.name, emoji: counterpart.emoji, color: counterpart.color, avatarUrl: counterpart.avatarUrl }
      : { title: chat.title, emoji: chat.emoji, color: chat.color, avatarUrl: chat.avatarUrl }

  const headerMenu = (e: React.MouseEvent) => openContextMenu(e, counterpartUid ? personMenu(counterpartUid) : chatMenu(chat))

  function onDragEnter(e: React.DragEvent) {
    if (!canPost || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragOver(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    if (!canPost) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length) addPendingFiles(files)
  }

  return (
    // min-w-0 is load-bearing: without it a nowrap preview row (pinned banner)
    // sets this flex item's min-width to max-content and pushes the sidebar
    // off-screen. Never remove it.
    <div
      className="relative flex h-full min-w-0 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--panel)]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <Paperclip size={34} className="text-[var(--accent)]" />
            <div className="font-bold">Отпусти, чтобы прикрепить</div>
            <div className="text-sm text-[var(--muted)]">Фото, видео и файлы улетят в этот чат 🎀</div>
          </div>
        </div>
      )}
      {/* header */}
      <div className="flex min-w-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-3 py-2.5" onContextMenu={headerMenu}>
        <button onClick={() => openChat('')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)] md:hidden">
          <ArrowLeft size={20} />
        </button>
        <button onClick={() => (counterpartUid ? setProfileUid(counterpartUid) : setRightPanel(true))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar emoji={headerVisual.emoji} color={headerVisual.color} src={headerVisual.avatarUrl} size={42} online={counterpartUid ? presence[counterpartUid]?.online : undefined} />
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-bold">
              <span className="truncate">{headerVisual.title}</span>
              {(counterpart?.verified || chat.verified) && <span className="text-[var(--accent)]">✔</span>}
            </div>
            <div className={classNames('truncate text-xs', sub.accent ? 'text-[var(--accent)]' : 'text-[var(--muted)]')}>{sub.text}</div>
          </div>
        </button>
        <button onClick={() => setSearchOpen((v) => !v)} className={classNames('grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]', searchOpen ? 'text-[var(--accent)]' : 'text-[var(--muted)]')} title="Поиск по чату">
          <Search size={19} />
        </button>
        <button onClick={(e) => (counterpartUid ? openContextMenu(e, personMenu(counterpartUid)) : openContextMenu(e, chatMenu(chat)))} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]" title="Действия">
          <Info size={19} />
        </button>
      </div>

      {/* in-chat search */}
      {searchOpen && (
        <div className="flex min-w-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
          <Search size={16} className="shrink-0 text-[var(--muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setMatchIdx(0) }}
            placeholder="Найти в этом чате…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {query && (
            <span className="shrink-0 text-xs text-[var(--muted)]">{matches.length ? `${matchIdx + 1} из ${matches.length}` : 'ничего'}</span>
          )}
          <button disabled={!matches.length} onClick={() => setMatchIdx((i) => (i + 1) % matches.length)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)] disabled:opacity-40" title="Предыдущее"><ChevronUp size={16} /></button>
          <button disabled={!matches.length} onClick={() => setMatchIdx((i) => (i - 1 + matches.length) % matches.length)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)] disabled:opacity-40" title="Следующее"><ChevronDown size={16} /></button>
          <button onClick={() => { setSearchOpen(false); setQuery('') }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]"><X size={16} /></button>
        </div>
      )}

      {/* pinned banner */}
      {pinned.length > 0 && (
        <button onClick={() => jumpTo(pinned[pinned.length - 1].id)} className="flex w-full min-w-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-left text-sm hover:bg-[var(--panel-hover)]">
          <Pin size={15} className="shrink-0 text-[var(--accent)]" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="text-[11px] font-bold text-[var(--accent)]">Закреплённое{pinned.length > 1 ? ` · ${pinned.length}` : ''}</div>
            <div className="truncate text-[var(--muted)]">
              {pinned[pinned.length - 1].sticker
                ? 'стикер'
                : pinned[pinned.length - 1].attachment
                ? attachmentLabel(pinned[pinned.length - 1].attachment)
                : plainText(pinned[pinned.length - 1].text)}
            </div>
          </div>
        </button>
      )}

      {/* messages */}
      <div className="relative min-h-0 min-w-0 flex-1">
        <div ref={scroller} onScroll={onScroll} onClick={onScrollerClick} className={classNames('relative z-[2] h-full overflow-y-auto overflow-x-hidden py-3 fancy-scroll', `wallpaper-${wallpaper}`)}>
          {visibleMsgs.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-2 text-center text-[var(--muted)]">
              <div className="text-5xl">{headerVisual.emoji}</div>
              <p className="font-semibold">Пока нет сообщений</p>
              <p className="text-sm">{isChannel ? 'Здесь скоро появятся посты ✨' : 'Напиши первым — это всегда приятно 🎀'}</p>
            </div>
          )}
          {visibleMsgs.map((m, i) => {
            const prev = visibleMsgs[i - 1]
            const next = visibleMsgs[i + 1]
            const newDay = !prev || dayLabel(prev.ts) !== dayLabel(m.ts)
            const win = 5 * 60_000
            const firstOfGroup = newDay || !prev || prev.senderUid !== m.senderUid || m.ts - prev.ts >= win || !!prev.system
            const lastOfGroup =
              !next || next.senderUid !== m.senderUid || next.ts - m.ts >= win || !!next.system || dayLabel(next.ts) !== dayLabel(m.ts)
            const sender = resolve(m.senderUid)
            const replied = m.replyToId ? msgs.find((x) => x.id === m.replyToId) : undefined
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--muted)] shadow-sm">{dayLabel(m.ts)}</span>
                  </div>
                )}
                {unreadMark.current.chatId === chat.id && unreadMark.current.ts === m.ts && (
                  <div className="my-2 flex items-center gap-3 px-4">
                    <span className="h-px flex-1 bg-[var(--accent)]/40" />
                    <span className="text-[11px] font-bold uppercase tracking-wide accent-text">Новые сообщения</span>
                    <span className="h-px flex-1 bg-[var(--accent)]/40" />
                  </div>
                )}
                <MessageBubble
                  message={m}
                  chat={chat}
                  /* A channel post belongs to the channel, not to whoever pressed
                     publish — so it always renders on the left, like in Telegram. */
                  isMine={!isChannel && m.senderUid === account.uid}
                  sender={sender}
                  firstOfGroup={firstOfGroup}
                  showAvatar={lastOfGroup}
                  repliedMessage={replied}
                  repliedSender={replied ? resolve(replied.senderUid) : undefined}
                  now={now}
                  bigEmoji={account.settings.bigEmoji}
                  otherUid={counterpartUid}
                  fresh={account.settings.animations && m.ts > openedAt.current}
                  onJump={jumpTo}
                />
              </div>
            )
          })}

          {typers.length > 0 && (
            <div className="px-4 py-1">
              <span className="inline-flex items-center gap-1 rounded-2xl bg-[var(--bubble-in)] px-3 py-2 shadow-sm">
                <Dot /> <Dot /> <Dot />
              </span>
            </div>
          )}
        </div>

        {!atBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-[3] grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-lg transition hover:scale-105 active:scale-95"
            style={{ boxShadow: 'var(--shadow)' }}
            title="Вниз"
          >
            <ArrowDown size={20} />
          </button>
        )}
      </div>

      {/* composer / notice */}
      {canPost ? (
        <Composer />
      ) : (
        <div className="border-t border-[var(--border)] bg-[var(--panel)] px-4 py-4 text-center text-sm text-[var(--muted)]">
          🔒 В этом канале публиковать могут только администраторы
        </div>
      )}
    </div>
  )
}

function Dot() {
  return <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted)]" style={{ animationDelay: `${Math.random() * 0.3}s` }} />
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center" style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}>
      <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        <Logo size={80} className="!rounded-3xl animate-float" />
        <h2 className="text-xl font-black">Добро пожаловать в FemboyChat</h2>
        <p className="text-sm text-[var(--muted)]">Выбери чат слева или найди новых собеседников через поиск. Открой сайт во второй вкладке, чтобы увидеть реальное время ✨</p>
      </div>
    </div>
  )
}
