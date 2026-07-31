import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Eye, Info, ListChecks, MessageCircle, Paperclip, Pin, Search, Send, Trash2, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { Logo } from '../ui/Logo'
import { Verified } from '../ui/Verified'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'
import { chatCounterpart, usePeople } from './people'
import { useActions } from './useActions'
import { openContextMenu } from '../ui/ContextMenu'
import { attachmentLabel } from '../../lib/media'
import { classNames, dayLabel, lastSeenLabel, plainText, renderRich, timeShort } from '../../lib/util'
import type { Chat, Message } from '../../types'

export function ChatView() {
  const account = useStore((s) => s.account)!
  const activeChatId = useStore((s) => s.activeChatId)
  const chats = useStore((s) => s.chats)
  const messages = useStore((s) => s.messages)
  const typing = useStore((s) => s.typing)
  const presence = useStore((s) => s.presence)
  const now = useStore((s) => s.now)
  const backend = useStore((s) => s.backend)
  const loadingChat = useStore((s) => s.loadingChat)
  const loadingMore = useStore((s) => s.loadingMore)
  const hasMore = useStore((s) => s.hasMore)
  const loadOlder = useStore((s) => s.loadOlder)
  const setRightPanel = useStore((s) => s.setRightPanel)
  const setProfileUid = useStore((s) => s.setProfileUid)
  const openChat = useStore((s) => s.openChat)
  const removeMsg = useStore((s) => s.remove)
  const toast = useStore((s) => s.toast)
  const { resolve } = usePeople()
  const { chatMenu, personMenu } = useActions()

  const chat = chats.find((c) => c.id === activeChatId) ?? null
  const msgs = activeChatId ? messages[activeChatId] ?? [] : []
  const loading = activeChatId ? !!loadingChat[activeChatId] : false
  const paging = activeChatId ? !!loadingMore[activeChatId] : false
  const scroller = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const openedAt = useRef(Date.now())
  /** scrollHeight captured right before an upward page load, to avoid a jump. */
  const prependAnchor = useRef<number | null>(null)
  /** Message count at the previous render, to tell new arrivals from paging. */
  const prevLen = useRef(0)
  const [atBottom, setAtBottom] = useState(true)
  /** How many messages arrived while the history was scrolled up. */
  const [newCount, setNewCount] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  const addPendingFiles = useStore((s) => s.addPendingFiles)
  /** Posts already reported as seen, so scrolling doesn't re-send them. */
  const viewedRef = useRef<Set<string>>(new Set())
  const [commentsForId, setCommentsForId] = useState<string | null>(null)
  /** Comment counts corrected by an opened thread (the row's is a snapshot). */
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  /** Multi-select: off by default, cleared whenever the chat changes. */
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  // «Новые сообщения» divider: freeze the first-unread timestamp per chat visit.
  const unreadMark = useRef<{ chatId: string; ts: number | null }>({ chatId: '', ts: null })
  const wallpaper = account.settings.wallpaper

  useEffect(() => {
    openedAt.current = Date.now()
    setSearchOpen(false)
    setQuery('')
    prependAnchor.current = null
    prevLen.current = 0
    viewedRef.current = new Set()
    setCommentsForId(null)
    setCommentCounts({})
    setSelectMode(false)
    setSelectedIds([])
    setNewCount(0)
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
    atBottomRef.current = true
    setAtBottom(true)
  }, [activeChatId])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // Older messages were just prepended: keep the reading position steady.
    if (prependAnchor.current !== null) {
      el.scrollTop += el.scrollHeight - prependAnchor.current
      prependAnchor.current = null
      prevLen.current = msgs.length
      return
    }

    const added = msgs.length - prevLen.current
    prevLen.current = msgs.length

    /*
      Sending is a promise to keep talking, so it always returns the view to the
      bottom — reading old messages and then answering used to leave you stuck
      up in the history, watching nothing happen.
    */
    const last = msgs[msgs.length - 1]
    const iJustSent = added > 0 && !!last && last.senderUid === account.uid && last.ts > openedAt.current

    if (atBottomRef.current || iJustSent) {
      if (iJustSent && !atBottomRef.current) {
        atBottomRef.current = true
        setAtBottom(true)
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
      setNewCount(0)
      return
    }

    // Reading further up: count what arrived instead of yanking the view down.
    if (added > 0) setNewCount((c) => c + added)
  }, [msgs.length])

  /**
   * A hit from the global search opens the chat and then asks for one specific
   * message. The chat's first page is usually still in flight at that moment,
   * so the bubble is polled for briefly instead of looked up once; a hit that
   * lives deeper in the history simply leaves the chat open at the bottom.
   */
  useEffect(() => {
    function onJump(e: Event) {
      const detail = (e as CustomEvent<{ chatId: string; messageId: string }>).detail
      if (!detail || detail.chatId !== activeChatId) return
      let tries = 0
      const tick = () => {
        if (document.getElementById(`msg-${detail.messageId}`)) {
          jumpTo(detail.messageId)
          return
        }
        if (tries++ < 20) setTimeout(tick, 150)
      }
      tick()
    }
    window.addEventListener('fc:jump', onJump)
    return () => window.removeEventListener('fc:jump', onJump)
  }, [activeChatId])

  /** Escape leaves selection mode before it does anything else. */
  useEffect(() => {
    if (!selectMode) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        exitSelect()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode])

  // Count a post as seen once it is actually on screen. Runs after layout, so
  // the freshly rendered bubbles already have their geometry.
  useEffect(() => {
    if (!chat || chat.type !== 'channel') return
    const raf = requestAnimationFrame(reportViews)
    return () => cancelAnimationFrame(raf)
  }, [msgs.length, chat?.id])

  /**
   * Report the channel posts currently inside the viewport. The backend keeps
   * its own per-session set, so a repeat id costs nothing; view counters are
   * decoration, so a failure is swallowed rather than shown.
   */
  function reportViews() {
    const el = scroller.current
    if (!el || !chat || chat.type !== 'channel' || !backend?.markViewed) return
    const box = el.getBoundingClientRect()
    const fresh: string[] = []
    for (const m of msgs) {
      if (m.pending || m.system || m.deleted || viewedRef.current.has(m.id)) continue
      const node = document.getElementById(`msg-${m.id}`)
      if (!node) continue
      const r = node.getBoundingClientRect()
      if (r.bottom > box.top && r.top < box.bottom) {
        viewedRef.current.add(m.id)
        fresh.push(m.id)
      }
    }
    if (fresh.length) void backend.markViewed(fresh).catch(() => {})
  }

  function onScroll() {
    const el = scroller.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90
    atBottomRef.current = bottom
    setAtBottom(bottom)
    // Reaching the bottom means everything below has been read.
    if (bottom) setNewCount(0)
    reportViews()
    // Infinite scroll upwards.
    if (el.scrollTop < 140 && activeChatId && !loading && !paging && hasMore[activeChatId] !== false && msgs.length) {
      prependAnchor.current = el.scrollHeight
      void loadOlder(activeChatId)
    }
  }

  function scrollToBottom() {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setNewCount(0)
  }

  /**
   * Bring a message into view.
   *
   * Deliberately NOT scrollIntoView: that scrolls every scrollable ancestor,
   * including the window, so the smallest horizontal overflow anywhere on the
   * page made the whole layout slide sideways and the sidebar disappear when
   * jumping to a pinned message. Moving the message list by hand can only ever
   * scroll vertically, inside the list.
   *
   * The offset is measured with rectangles rather than `offsetTop`, because
   * `offsetTop` is relative to the nearest positioned ancestor — each row now
   * has one — so it used to read as ≈ 0 and every jump landed at the very top
   * of the history.
   */
  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`)
    const box = scroller.current
    if (!el) {
      toast('Это сообщение ещё не загружено — прокрути историю выше', '🔎')
      return
    }
    if (box && box.contains(el)) {
      const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top
      const target = box.scrollTop + delta - box.clientHeight / 2 + el.offsetHeight / 2
      box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }
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

  function toggleSelect(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  /**
   * Enter selection mode from a long press, with that message already ticked.
   * On a phone this is the only comfortable way in — the header button asks for
   * a second, deliberate tap before anything is chosen.
   */
  function startSelect(m: Message) {
    setSelectMode(true)
    setSelectedIds([m.id])
    navigator.vibrate?.(8)
  }

  function exitSelect() {
    setSelectMode(false)
    setSelectedIds([])
  }

  const visibleMsgs = useMemo(
    () => msgs.filter((m) => !(m.ttl && now > m.ts + m.ttl * 1000 && m.senderUid !== account.uid) || !m.ttl),
    [msgs, now, account.uid],
  )
  const pinned = useMemo(() => msgs.filter((m) => m.pinned && !m.deleted), [msgs])

  /** Selected messages in reading order, whatever order they were tapped in. */
  const picked = useMemo(() => visibleMsgs.filter((m) => selectedIds.includes(m.id)), [visibleMsgs, selectedIds])
  const allMine = picked.length > 0 && picked.every((m) => m.senderUid === account.uid && !m.deleted)

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

  /** Copy as a readable transcript: «кто · когда», then the text. */
  function copySelected() {
    if (!picked.length) return
    const text = picked
      .map((m) => `${resolve(m.senderUid).name} · ${timeShort(m.ts)}\n${m.sticker ?? plainText(m.text) ?? ''}`.trim())
      .join('\n\n')
    navigator.clipboard?.writeText(text)
    toast(picked.length === 1 ? 'Скопировано' : `Скопировано сообщений: ${picked.length}`, '📋')
    exitSelect()
  }

  /**
   * Bulk delete. Only own messages can go — the server would refuse the rest
   * anyway, so the button stays disabled instead of failing halfway.
   */
  async function deleteSelected() {
    if (!picked.length || !allMine || busy) return
    if (!confirm(picked.length === 1 ? 'Удалить сообщение?' : `Удалить сообщений: ${picked.length}?`)) return
    setBusy(true)
    try {
      for (const m of picked) await removeMsg(m.id)
      exitSelect()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не всё удалось удалить', '⚠️')
    } finally {
      setBusy(false)
    }
  }

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
  const commentsPost = commentsForId ? msgs.find((m) => m.id === commentsForId) ?? null : null

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
    // min-w-0 and overflow-hidden are load-bearing: without them a wide child
    // (a nowrap preview row, a long link, a channel post) sets this pane's
    // minimum width to its content width and pushes the sidebar off-screen.
    // Never remove them.
    <div
      className="relative flex h-full min-w-0 flex-col overflow-hidden"
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
            <div className="flex min-w-0 items-center gap-1.5 font-bold">
              <span className="truncate">{headerVisual.title}</span>
              {(counterpart?.verified || chat.verified) && <Verified size={16} />}
            </div>
            <div className={classNames('truncate text-xs', sub.accent ? 'text-[var(--accent)]' : 'text-[var(--muted)]')}>{sub.text}</div>
          </div>
        </button>
        <button
          onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
          className={classNames('grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]', selectMode ? 'text-[var(--accent)]' : 'text-[var(--muted)]')}
          title={selectMode ? 'Выйти из выделения' : 'Выбрать сообщения'}
        >
          <ListChecks size={19} />
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
        <button onClick={() => jumpTo(pinned[pinned.length - 1].id)} className="flex w-full min-w-0 items-center gap-2 overflow-hidden border-b border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-left text-sm hover:bg-[var(--panel-hover)]">
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
          {paging && (
            <div className="flex justify-center py-2">
              <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--muted)] shadow-sm">Загружаем историю…</span>
            </div>
          )}
          {loading && visibleMsgs.length === 0 && <HistorySkeleton />}
          {!loading && visibleMsgs.length === 0 && (
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
            const isPicked = selectedIds.includes(m.id)
            return (
              <div key={m.id} className={classNames('min-w-0', m.pending && 'opacity-60 transition-opacity', m.failed && 'opacity-80')}>
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
                <div className={classNames('relative min-w-0', isPicked && 'msg-selected')}>
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
                    onOpenComments={isChannel && backend?.listComments ? (msg) => setCommentsForId(msg.id) : undefined}
                    commentCount={commentCounts[m.id]}
                    onSelect={m.system ? undefined : startSelect}
                  />
                  {/*
                    In selection mode a hit area covers the whole row, so a tap
                    anywhere — on a link, a photo, a reaction — picks the message
                    instead of doing its usual thing. Touch events stop here too,
                    otherwise the swipe-to-reply handler underneath would fire.
                  */}
                  {selectMode && !m.system && (
                    <button
                      onClick={() => toggleSelect(m.id)}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      className="absolute inset-0 z-[6] flex items-center px-2 sm:px-3"
                      aria-pressed={isPicked}
                      aria-label={isPicked ? 'Снять выделение' : 'Выделить сообщение'}
                    >
                      <span
                        className={classNames(
                          'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 shadow-sm transition',
                          isPicked ? 'accent-gradient border-transparent text-white' : 'border-[var(--border)] bg-[var(--panel)] text-transparent',
                        )}
                      >
                        <Check size={14} />
                      </span>
                    </button>
                  )}
                </div>
                {m.failed && (
                  <div className="px-4 pb-1 text-right text-[11px] font-semibold text-[#ff6b6b]">Не отправлено · проверь связь</div>
                )}
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

        {/*
          The jump-down button doubles as an unread counter, like in Telegram:
          while you are reading further up, everything that arrives is counted
          on the badge instead of dragging the view down under your finger.
        */}
        {(!atBottom || newCount > 0) && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-[3] grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-lg transition hover:scale-105 active:scale-95"
            style={{ boxShadow: 'var(--shadow)' }}
            title={newCount > 0 ? `Новых сообщений: ${newCount}` : 'Вниз'}
          >
            <ArrowDown size={20} />
            {newCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full accent-gradient px-1 text-[10px] font-black tabular-nums text-white shadow-md animate-pop-in">
                {newCount > 99 ? '99+' : newCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* selection bar / composer / notice */}
      {selectMode ? (
        <div className="flex min-w-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--panel)] px-3 py-2.5">
          <button onClick={exitSelect} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]" title="Отмена">
            <X size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{picked.length ? `Выбрано: ${picked.length}` : 'Выбери сообщения'}</div>
            <div className="truncate text-[11px] text-[var(--muted)]">{picked.length && !allMine ? 'Удалять можно только свои сообщения' : 'Нажимай на сообщения, чтобы отметить их'}</div>
          </div>
          <button
            onClick={copySelected}
            disabled={!picked.length}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] transition enabled:hover:bg-[var(--panel-hover)] enabled:hover:text-[var(--text)] disabled:opacity-40"
            title="Копировать"
          >
            <Copy size={17} /> <span className="hidden sm:inline">Копировать</span>
          </button>
          <button
            onClick={deleteSelected}
            disabled={!picked.length || !allMine || busy}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-500 transition enabled:hover:bg-rose-500/10 disabled:opacity-40"
            title="Удалить"
          >
            <Trash2 size={17} /> <span className="hidden sm:inline">{busy ? 'Удаляем…' : 'Удалить'}</span>
          </button>
        </div>
      ) : canPost ? (
        <Composer />
      ) : (
        <div className="border-t border-[var(--border)] bg-[var(--panel)] px-4 py-4 text-center text-sm text-[var(--muted)]">
          🔒 В этом канале публиковать могут только администраторы — но комментарии открыты всем ✨
        </div>
      )}

      {commentsPost && (
        <CommentsPanel
          chat={chat}
          post={commentsPost}
          onClose={() => setCommentsForId(null)}
          onCount={(n) => setCommentCounts((c) => ({ ...c, [commentsPost.id]: n }))}
        />
      )}
    </div>
  )
}

/**
 * Comment thread for a single channel post, as a right-hand drawer.
 *
 * Comments live in the same table as messages but are filtered out of every
 * feed, and realtime drops them on purpose — otherwise each one would show up
 * as a standalone post and fire a notification. That is why a sent comment is
 * appended to local state here instead of arriving through the socket.
 */
function CommentsPanel({
  chat,
  post,
  onClose,
  onCount,
}: {
  chat: Chat
  post: Message
  onClose: () => void
  onCount: (n: number) => void
}) {
  const backend = useStore((s) => s.backend)!
  const account = useStore((s) => s.account)!
  const toast = useStore((s) => s.toast)
  const { resolve } = usePeople()
  const [items, setItems] = useState<Message[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setItems(null)
    void (async () => {
      try {
        const rows = await backend.listComments?.(post.id)
        if (!alive) return
        setItems(rows ?? [])
        onCount((rows ?? []).length)
      } catch {
        if (alive) setItems([])
      }
    })()
    return () => {
      alive = false
    }
  }, [post.id])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items?.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const saved = await backend.send({ chatId: chat.id, senderUid: account.uid, text: body, commentOf: post.id })
      const next = [...(items ?? []), saved]
      setItems(next)
      onCount(next.length)
      setText('')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось отправить комментарий', '⚠️')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex overflow-hidden">
      <button onClick={onClose} className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" title="Закрыть" />
      <div className="relative ml-auto flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--panel)] shadow-2xl animate-fade-in sm:w-[400px]">
        <div className="flex min-w-0 items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <MessageCircle size={17} className="shrink-0 text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">Комментарии</div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <span>{items ? `${items.length}` : '…'}</span>
              <span className="flex items-center gap-1"><Eye size={12} /> {(post.viewCount ?? 0).toLocaleString('ru-RU')}</span>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]">
            <X size={17} />
          </button>
        </div>

        {/* the post being discussed, trimmed to a couple of lines */}
        <div className="min-w-0 border-b border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5">
          <div className="line-clamp-3 break-words text-xs text-[var(--muted)]" style={{ overflowWrap: 'anywhere' }}>{plainText(post.text) || 'Пост без текста'}</div>
        </div>

        <div ref={listRef} className="fancy-scroll min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-3">
          {items === null && (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--panel-2)]" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 animate-pulse rounded bg-[var(--panel-2)]" />
                    <div className="h-3 w-full animate-pulse rounded bg-[var(--panel-2)]" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {items?.length === 0 && (
            <div className="mt-10 flex flex-col items-center gap-1.5 text-center text-[var(--muted)]">
              <div className="text-4xl">💬</div>
              <p className="text-sm font-semibold">Пока тишина</p>
              <p className="text-xs">Будь первым, кто ответит на этот пост 🎀</p>
            </div>
          )}
          {items?.map((c) => {
            const who = resolve(c.senderUid)
            return (
              <div key={c.id} className="flex min-w-0 gap-2">
                <Avatar emoji={who.emoji} color={who.color} src={who.avatarUrl} size={32} />
                <div className="min-w-0 flex-1 rounded-2xl bg-[var(--bubble-in)] px-3 py-2" style={{ color: 'var(--bubble-in-text)' }}>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-xs font-bold" style={{ color: who.color }}>{who.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--muted)]">{timeShort(c.ts)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm" style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={renderRich(c.text)} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex min-w-0 items-end gap-2 border-t border-[var(--border)] px-3 py-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder="Написать комментарий…"
            className="input !py-2.5 text-sm"
          />
          <button
            onClick={submit}
            disabled={!text.trim() || sending}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full accent-gradient text-white transition disabled:opacity-40"
            title="Отправить"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Placeholder shown while the first page of history is in flight. The shapes
 * follow the real bubble rhythm (alternating sides, uneven widths) so the swap
 * to real content is not a visual jolt.
 */
function HistorySkeleton() {
  const rows: Array<{ mine: boolean; w: string; h: string }> = [
    { mine: false, w: 'w-52', h: 'h-12' },
    { mine: true, w: 'w-36', h: 'h-10' },
    { mine: false, w: 'w-64', h: 'h-16' },
    { mine: true, w: 'w-44', h: 'h-10' },
    { mine: false, w: 'w-40', h: 'h-10' },
    { mine: true, w: 'w-56', h: 'h-14' },
  ]
  return (
    <div className="space-y-3 px-4 pt-2" aria-hidden="true">
      {rows.map((r, i) => (
        <div key={i} className={classNames('flex', r.mine ? 'justify-end' : 'justify-start')}>
          <div
            className={classNames('max-w-[70%] animate-pulse rounded-2xl', r.w, r.h, r.mine ? 'bg-[var(--accent)]/20' : 'bg-[var(--bubble-in)]')}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        </div>
      ))}
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
