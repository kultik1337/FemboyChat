import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Info, Pin, Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { Logo } from '../ui/Logo'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'
import { chatCounterpart, usePeople } from './people'
import { useActions } from './useActions'
import { openContextMenu } from '../ui/ContextMenu'
import { classNames, dayLabel, lastSeenLabel } from '../../lib/util'

export function ChatView() {
  const account = useStore((s) => s.account)!
  const activeChatId = useStore((s) => s.activeChatId)
  const chats = useStore((s) => s.chats)
  const messages = useStore((s) => s.messages)
  const typing = useStore((s) => s.typing)
  const presence = useStore((s) => s.presence)
  const now = useStore((s) => s.now)
  const toast = useStore((s) => s.toast)
  const setRightPanel = useStore((s) => s.setRightPanel)
  const setProfileUid = useStore((s) => s.setProfileUid)
  const openChat = useStore((s) => s.openChat)
  const { resolve } = usePeople()
  const { chatMenu, personMenu } = useActions()

  const chat = chats.find((c) => c.id === activeChatId) ?? null
  const msgs = activeChatId ? messages[activeChatId] ?? [] : []
  const scroller = useRef<HTMLDivElement>(null)
  const wallpaper = account.settings.wallpaper

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs.length, activeChatId])

  const visibleMsgs = useMemo(
    () => msgs.filter((m) => !(m.ttl && now > m.ts + m.ttl * 1000 && m.senderUid !== account.uid) || !m.ttl),
    [msgs, now, account.uid],
  )
  const pinned = useMemo(() => msgs.filter((m) => m.pinned && !m.deleted), [msgs])

  if (!chat) return <EmptyState />

  const counterpartUid = chatCounterpart(chat, account.uid)
  const counterpart = counterpartUid ? resolve(counterpartUid) : null
  const isAdmin = chat.adminUids.includes(account.uid)
  const canPost = chat.type !== 'channel' || isAdmin

  const typers = Object.entries(typing[chat.id] ?? {}).filter(([uid, t]) => uid !== account.uid && now - t.at < 4000)

  function subtitle() {
    if (typers.length) return { text: chat!.type === 'group' ? `${typers.map((t) => t[1].name.split(' ')[0]).join(', ')} печатает…` : 'печатает…', accent: true }
    if (chat!.type === 'group') return { text: `${chat!.memberCount ?? chat!.memberUids.length} участников`, accent: false }
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
      ? { title: 'Избранное', emoji: '🔖', color: '#7cc4ff' }
      : counterpart
      ? { title: counterpart.name, emoji: counterpart.emoji, color: counterpart.color }
      : { title: chat.title, emoji: chat.emoji, color: chat.color }

  const headerMenu = (e: React.MouseEvent) => openContextMenu(e, counterpartUid ? personMenu(counterpartUid) : chatMenu(chat))

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-3 py-2.5" onContextMenu={headerMenu}>
        <button onClick={() => openChat('')} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--panel-hover)] md:hidden">
          <ArrowLeft size={20} />
        </button>
        <button onClick={() => (counterpartUid ? setProfileUid(counterpartUid) : setRightPanel(true))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar emoji={headerVisual.emoji} color={headerVisual.color} size={42} online={counterpartUid ? presence[counterpartUid]?.online : undefined} />
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-bold">
              <span className="truncate">{headerVisual.title}</span>
              {(counterpart?.verified || chat.verified) && <span className="text-[var(--accent)]">✔</span>}
            </div>
            <div className={classNames('truncate text-xs', sub.accent ? 'text-[var(--accent)]' : 'text-[var(--muted)]')}>{sub.text}</div>
          </div>
        </button>
        <button className="grid h-9 w-9 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]" title="Поиск (демо)" onClick={() => toast('Поиск по чату скоро ✨')}>
          <Search size={19} />
        </button>
        <button onClick={(e) => (counterpartUid ? openContextMenu(e, personMenu(counterpartUid)) : openContextMenu(e, chatMenu(chat)))} className="grid h-9 w-9 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]" title="Действия">
          <Info size={19} />
        </button>
      </div>

      {/* pinned banner */}
      {pinned.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-sm">
          <Pin size={15} className="text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-[var(--accent)]">Закреплённое{pinned.length > 1 ? ` · ${pinned.length}` : ''}</div>
            <div className="truncate text-[var(--muted)]">{pinned[pinned.length - 1].sticker ? 'стикер' : pinned[pinned.length - 1].text}</div>
          </div>
        </div>
      )}

      {/* messages */}
      <div ref={scroller} className={classNames('flex-1 overflow-y-auto py-3 fancy-scroll', `wallpaper-${wallpaper}`)}>
        {visibleMsgs.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center text-[var(--muted)]">
            <div className="text-5xl">{headerVisual.emoji}</div>
            <p className="font-semibold">Пока нет сообщений</p>
            <p className="text-sm">Напиши первым — это всегда приятно 🎀</p>
          </div>
        )}
        {visibleMsgs.map((m, i) => {
          const prev = visibleMsgs[i - 1]
          const newDay = !prev || dayLabel(prev.ts) !== dayLabel(m.ts)
          const grouped = !newDay && prev && prev.senderUid === m.senderUid && m.ts - prev.ts < 5 * 60_000 && !prev.system
          const sender = resolve(m.senderUid)
          const replied = m.replyToId ? msgs.find((x) => x.id === m.replyToId) : undefined
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--muted)] shadow-sm">{dayLabel(m.ts)}</span>
                </div>
              )}
              <MessageBubble
                message={m}
                chat={chat}
                isMine={m.senderUid === account.uid}
                sender={sender}
                showName={!grouped}
                showAvatar={!grouped}
                repliedMessage={replied}
                repliedSender={replied ? resolve(replied.senderUid) : undefined}
                now={now}
                bigEmoji={account.settings.bigEmoji}
                otherUid={counterpartUid}
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
