import { useRef, useState } from 'react'
import { Check, CheckCheck, Clock, CornerUpLeft, Download, Eye, FileText, MessageCircle, MoreHorizontal, Smile } from 'lucide-react'
import type { Attachment, Chat, Message } from '../../types'
import { classNames, renderPost, renderRich, timeShort } from '../../lib/util'
import { attachmentLabel, prettySize } from '../../lib/media'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { Sticker } from '../ui/Sticker'
import { VoicePlayer } from '../ui/VoicePlayer'
import { VideoPlayer } from '../ui/VideoPlayer'
import { LinkPreviewCard } from './LinkPreviewCard'
import { openContextMenu } from '../ui/ContextMenu'
import { useActions } from './useActions'
import { usePeople } from './people'
import type { Person } from './people'

const emojiOnly = (t: string) => /^\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic}|\ufe0f|\s)*$/u.test(t.trim()) && [...t.trim()].length <= 6

/** How far the bubble follows the finger, and where the reply fires. */
const SWIPE_MAX = 84
const SWIPE_TRIGGER = 52
/** Below this the gesture is still undecided — it may turn out to be a scroll. */
const SWIPE_SLOP = 12

export function MessageBubble({
  message,
  chat,
  isMine,
  sender,
  firstOfGroup,
  showAvatar,
  repliedMessage,
  repliedSender,
  now,
  bigEmoji,
  otherUid,
  fresh,
  onJump,
  onOpenComments,
  commentCount,
}: {
  message: Message
  chat: Chat
  isMine: boolean
  sender: Person
  firstOfGroup: boolean
  showAvatar: boolean
  repliedMessage?: Message
  repliedSender?: Person
  now: number
  bigEmoji: boolean
  otherUid?: string
  fresh?: boolean
  onJump?: (id: string) => void
  /** Channel posts only: opens the comment thread for this post. */
  onOpenComments?: (message: Message) => void
  /** Overrides the stored counter once the thread has been opened. */
  commentCount?: number
}) {
  const react = useStore((s) => s.react)
  const vote = useStore((s) => s.vote)
  const account = useStore((s) => s.account)
  const setProfileUid = useStore((s) => s.setProfileUid)
  const setComposeReply = useStore((s) => s.setComposeReply)
  const { messageMenu } = useActions()
  // Forwarded messages name whoever actually wrote them.
  const { resolve } = usePeople()
  const [pop, setPop] = useState(false)
  // Swipe-to-reply: how far the row is currently pulled, and the live gesture.
  const [pull, setPull] = useState(0)
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null)

  function openMenu(e: React.MouseEvent) {
    const { items, reactions } = messageMenu(message)
    openContextMenu(e, items, { reactions })
  }

  function quickReact() {
    if (message.deleted || message.system) return
    react(message.id, '❤️')
    setPop(true)
    setTimeout(() => setPop(false), 700)
  }

  if (message.system) {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--muted)]">{message.text}</span>
      </div>
    )
  }

  const ttlLeft = message.ttl ? Math.max(0, Math.ceil((message.ts + message.ttl * 1000 - now) / 1000)) : 0
  const read = otherUid ? message.readByUids.includes(otherUid) : message.readByUids.length > 1
  const big = bigEmoji && !message.sticker && !message.attachment && emojiOnly(message.text)
  const showName = firstOfGroup && !isMine && chat.type === 'group'
  const showChecks = isMine && chat.type !== 'channel'
  /** Headings, dividers, quotes and lists are a channel-only privilege. */
  const isPost = chat.type === 'channel'
  // The stored counter is a snapshot from load time; the panel knows better.
  const comments = commentCount ?? message.commentCount ?? 0
  const views = message.viewCount ?? 0

  /*
    Swipe-to-reply, Telegram-style: drag a message to the left and let go.
    The gesture stays undecided until the finger has clearly moved sideways,
    so vertical scrolling through the history is never hijacked — that is also
    why the row keeps `touch-action: pan-y` and the handlers never call
    preventDefault.
  */
  const canSwipeReply = !message.deleted && !message.pending

  function onTouchStart(e: React.TouchEvent) {
    if (!canSwipeReply || e.touches.length !== 1) return
    const t = e.touches[0]
    swipe.current = { x: t.clientX, y: t.clientY, active: false }
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = swipe.current
    if (!s || e.touches.length !== 1) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y

    if (!s.active) {
      // A mostly-vertical move is a scroll: hand it back to the list for good.
      if (Math.abs(dy) > Math.abs(dx)) {
        swipe.current = null
        return
      }
      if (Math.abs(dx) < SWIPE_SLOP) return
      s.active = true
    }

    // Only leftwards, and with a hard stop so the bubble cannot fly away.
    setPull(Math.max(0, Math.min(-dx, SWIPE_MAX)))
  }

  function onTouchEnd() {
    const s = swipe.current
    swipe.current = null
    if (s?.active && pull >= SWIPE_TRIGGER) {
      setComposeReply(message)
      navigator.vibrate?.(8)
    }
    setPull(0)
  }

  const swiping = !!swipe.current?.active
  const swipeProgress = Math.min(1, pull / SWIPE_TRIGGER)

  // Telegram-style stacked corners: tighten the corner on the sender's side
  // between consecutive messages, keep the outer "tail" corners round.
  const R = 'var(--radius-bubble)'
  const tight = '7px'
  const near = { top: firstOfGroup ? R : tight, bot: showAvatar ? R : tight }
  const radius = isMine
    ? `${R} ${near.top} ${near.bot} ${R}`
    : `${near.top} ${R} ${R} ${near.bot}`

  const forwardedFrom = message.forwardedFrom ? resolve(message.forwardedFrom) : null

  const buildHeader = (withName: boolean) => {
    const showNameHere = withName && showName
    if (!showNameHere && !message.forwardedFrom && !repliedMessage) return null
    return (
      <>
        {showNameHere && (
          <button onClick={() => setProfileUid(sender.uid)} className="mb-0.5 block max-w-full truncate text-xs font-bold" style={{ color: sender.color }}>
            {sender.name}
          </button>
        )}
        {message.forwardedFrom && (
          <button
            onClick={() => setProfileUid(message.forwardedFrom!)}
            className="mb-1 block max-w-full truncate text-[11px] font-semibold opacity-80 transition hover:opacity-100"
            title="Открыть профиль автора"
          >
            ↪ Переслано от {forwardedFrom?.name ?? 'Кто-то'}
          </button>
        )}
        {repliedMessage && (
          <button
            onClick={() => onJump?.(repliedMessage.id)}
            className="mb-1 block w-full min-w-0 border-l-2 pl-2 text-left text-[0.8rem] opacity-90 transition hover:opacity-100"
            style={{ borderColor: isMine ? 'rgba(255,255,255,0.7)' : 'var(--accent)' }}
          >
            <div className="truncate font-semibold">{repliedSender?.name ?? 'Сообщение'}</div>
            <div className="truncate opacity-80">{repliedMessage.deleted ? 'сообщение удалено' : repliedMessage.sticker ? 'стикер' : repliedMessage.attachment ? attachmentLabel(repliedMessage.attachment) : repliedMessage.text}</div>
          </button>
        )}
      </>
    )
  }
  const header = buildHeader(true)
  // Фото/GIF/видео идут без полоски с ником (как в TG) — отправителя видно по аватарке.
  const visualKind = message.attachment && (message.attachment.kind === 'image' || message.attachment.kind === 'gif' || message.attachment.kind === 'video')
  const mediaHeader = buildHeader(!visualKind)

  const meta = (overlay: boolean) => (
    <span
      className={classNames(
        'flex items-center gap-1 text-[10px] leading-none',
        overlay
          ? 'rounded-full bg-black/45 px-1.5 py-1 text-white/95 backdrop-blur-[2px]'
          : isMine ? 'text-white/80' : 'text-[var(--muted)]',
      )}
    >
      {ttlLeft > 0 && <span className="flex items-center gap-0.5"><Clock size={11} /> {ttlLeft}s</span>}
      {message.pending && <span className="flex items-center gap-0.5"><Clock size={11} /></span>}
      {message.editedTs && <span>изменено</span>}
      <span>{timeShort(message.ts)}</span>
      {showChecks && !message.pending && (read ? <CheckCheck size={13} /> : <Check size={13} />)}
    </span>
  )

  // Telegram-style reaction pills, living INSIDE the bubble next to the time.
  const reactionPills = (overlay: boolean) =>
    message.reactions.length > 0 ? (
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {message.reactions.map((r) => {
          const mine = account ? r.uids.includes(account.uid) : false
          return (
            <button
              key={r.emoji}
              onClick={(e) => { e.stopPropagation(); react(message.id, r.emoji) }}
              className={classNames(
                'flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-bold leading-none transition hover:scale-105 active:scale-95',
                overlay
                  ? mine ? 'bg-white text-[var(--accent)] shadow' : 'bg-black/45 text-white backdrop-blur-[2px]'
                  : mine
                    ? isMine ? 'bg-white text-[var(--accent)] shadow-sm' : 'accent-gradient text-white shadow-sm'
                    : isMine ? 'bg-white/25 text-white' : 'bg-[var(--accent)]/15 accent-text',
              )}
            >
              <span className="text-[13px] leading-none">{r.emoji}</span>
              <span className="tabular-nums">{r.uids.length}</span>
            </button>
          )
        })}
      </span>
    ) : null

  // Shared bottom strip: reactions on the left, time on the right (как в TG).
  const footer = (
    <div className="mt-1 flex min-w-0 flex-wrap items-end justify-end gap-x-2 gap-y-1">
      {reactionPills(false)}
      <span className="ml-auto">{meta(false)}</span>
    </div>
  )

  return (
    <div
      id={`msg-${message.id}`}
      className={classNames('group relative flex min-w-0 gap-2 px-3 sm:px-4', isMine ? 'flex-row-reverse' : 'flex-row', firstOfGroup ? 'mt-4' : 'mt-1', fresh && 'animate-fade-in')}
      onContextMenu={message.deleted ? undefined : openMenu}
      onDoubleClick={quickReact}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        touchAction: 'pan-y',
        transform: pull ? `translateX(-${pull}px)` : undefined,
        transition: swiping ? 'none' : 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      {pull > 0 && (
        <span
          className="pointer-events-none absolute right-1 top-1/2 grid h-9 w-9 place-items-center rounded-full bg-[var(--panel-2)] text-[var(--accent)] shadow-sm"
          style={{
            opacity: swipeProgress,
            transform: `translateY(-50%) scale(${0.7 + swipeProgress * 0.3})`,
          }}
        >
          <CornerUpLeft size={17} />
        </span>
      )}

      {!isMine && chat.type === 'group' ? (
        showAvatar ? (
          <button onClick={() => setProfileUid(sender.uid)} className="mt-auto">
            <Avatar emoji={sender.emoji} color={sender.color} src={sender.avatarUrl} size={32} />
          </button>
        ) : (
          <div className="w-8 shrink-0" />
        )
      ) : null}

      {/*
        min-w-0 keeps a wide child (code, an unbreakable link, a preview card)
        from setting this column's minimum width to its content width, which is
        what used to stretch the whole chat pane. Channel posts get a fixed
        comfortable measure instead of a percentage, so a post reads like a post
        on a wide screen rather than a banner.
      */}
      <div className={classNames('relative min-w-0', isPost ? 'w-full max-w-[min(100%,640px)]' : 'max-w-[76%] sm:max-w-[68%]', isMine ? 'items-end' : 'items-start')}>
        {pop && <span className="heart-pop">❤️</span>}
        {message.sticker ? (
          <div className={classNames('flex', isMine ? 'justify-end' : 'justify-start')}>
            <Sticker emoji={message.sticker} size={124} />
          </div>
        ) : message.deleted ? (
          <div className="rounded-2xl border border-[var(--border)] px-3.5 py-2 text-sm italic text-[var(--muted)]">сообщение удалено</div>
        ) : big ? (
          <div className={classNames('text-5xl leading-tight', isMine ? 'text-right' : 'text-left', fresh && 'jumbo-in')}>{message.text}</div>
        ) : message.attachment && !message.poll ? (
          <MediaMessage
            a={message.attachment}
            caption={message.text}
            header={mediaHeader}
            meta={meta}
            reactionPills={reactionPills}
            footer={footer}
            isMine={isMine}
            isPost={isPost}
            radius={radius}
          />
        ) : (
          <div
            className="relative min-w-0 overflow-hidden px-3.5 py-2 text-[0.95rem] leading-relaxed shadow-sm"
            style={{
              borderRadius: radius,
              background: isMine ? 'var(--bubble-out)' : 'var(--bubble-in)',
              color: isMine ? 'var(--bubble-out-text)' : 'var(--bubble-in-text)',
            }}
          >
            {header}

            {message.poll ? (
              <PollView message={message} onVote={(i) => vote(message.id, i)} />
            ) : message.text ? (
              <>
                <LongText text={message.text} isMine={isMine} isPost={isPost} />
                <LinkPreviewCard text={message.text} isMine={isMine} />
              </>
            ) : null}

            {footer}
          </div>
        )}

        {/* Channel posts carry their own strip: views on the right, comments on
            the left. Deleted posts get nothing — there is nothing to discuss. */}
        {isPost && !message.deleted && !message.pending && (
          <button
            onClick={() => onOpenComments?.(message)}
            disabled={!onOpenComments}
            className="mt-1 flex w-full min-w-0 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs font-bold text-[var(--muted)] shadow-sm transition enabled:hover:bg-[var(--panel-hover)] enabled:hover:text-[var(--text)] disabled:cursor-default"
            style={{ boxShadow: 'var(--shadow)' }}
            title={comments > 0 ? 'Открыть обсуждение' : 'Оставить комментарий'}
          >
            <MessageCircle size={14} className="shrink-0 text-[var(--accent)]" />
            <span className="truncate">{comments > 0 ? `Комментарии · ${comments}` : 'Комментировать'}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 tabular-nums opacity-80">
              <Eye size={13} /> {views.toLocaleString('ru-RU')}
            </span>
          </button>
        )}

        {!message.deleted && (
          <div className={classNames('absolute top-0 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100', isMine ? '-left-2 -translate-x-full' : '-right-2 translate-x-full')}>
            <IconBtn onClick={openMenu} title="Реакции и действия"><Smile size={15} /></IconBtn>
            <IconBtn onClick={() => setComposeReply(message)} title="Ответить"><CornerUpLeft size={15} /></IconBtn>
            <IconBtn onClick={openMenu} title="Ещё"><MoreHorizontal size={15} /></IconBtn>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Telegram-style media message.
 * - Photo/GIF/video without caption: bare media with rounded corners and the
 *   time overlaid on the picture — no fat bubble around it.
 * - With a caption (or name/reply header): the media sits edge-to-edge at the
 *   top of the bubble and a slim bubble section with the caption appears below.
 * - Files and voice notes: one compact card (the card *is* the bubble), no
 *   nested boxes; caption, when present, is a slim section underneath.
 */
function MediaMessage({
  a,
  caption,
  header,
  meta,
  reactionPills,
  footer,
  isMine,
  isPost,
  radius,
}: {
  a: Attachment
  caption: string
  header: React.ReactNode
  meta: (overlay: boolean) => React.ReactNode
  reactionPills: (overlay: boolean) => React.ReactNode
  footer: React.ReactNode
  isMine: boolean
  isPost?: boolean
  radius: string
}) {
  const isVisual = a.kind === 'image' || a.kind === 'gif' || a.kind === 'video'
  const bare = isVisual && !caption && !header

  // Bare photo / GIF / video: just the media; reactions + time float on top.
  if (bare) {
    return (
      <div className="relative max-w-[min(100%,380px)] overflow-hidden shadow-sm" style={{ borderRadius: radius }}>
        <VisualMedia a={a} />
        <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-[1] flex flex-wrap items-end justify-end gap-1 [&_button]:pointer-events-auto">
          {reactionPills(true)}
          <span className="ml-auto">{meta(true)}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={classNames('min-w-0 overflow-hidden text-[0.95rem] leading-relaxed shadow-sm', isVisual && 'max-w-[min(100%,380px)]')}
      style={{
        borderRadius: radius,
        background: isMine ? 'var(--bubble-out)' : 'var(--bubble-in)',
        color: isMine ? 'var(--bubble-out-text)' : 'var(--bubble-in-text)',
      }}
    >
      {header && <div className="px-3 pt-1.5">{header}</div>}

      {isVisual ? (
        <VisualMedia a={a} fill />
      ) : a.kind === 'voice' || a.kind === 'audio' ? (
        <div className="px-3 pt-2.5"><VoicePlayer a={a} /></div>
      ) : (
        <FileMedia a={a} />
      )}

      {/* slim caption strip under the media, как в Telegram */}
      <div className={classNames('min-w-0 px-3 pb-1.5', caption ? 'pt-1.5' : 'pt-0')}>
        {caption && <LongText text={caption} isMine={isMine} isPost={isPost} />}
        {caption && <LinkPreviewCard text={caption} isMine={isMine} />}
        {footer}
      </div>
    </div>
  )
}

/** Photo / GIF / video renderer (edge-to-edge, no own corners — the parent clips). */
function VisualMedia({ a, fill }: { a: Attachment; fill?: boolean }) {
  const setLightbox = useStore((s) => s.setLightbox)
  const [revealed, setRevealed] = useState(false)
  const ratio = a.w && a.h ? `${a.w} / ${a.h}` : undefined
  const hidden = !!a.spoiler && !revealed

  if (hidden) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setRevealed(true) }}
        className={classNames('relative block max-w-full overflow-hidden', fill && 'w-full')}
        title="Показать спойлер"
      >
        {a.kind === 'video' ? (
          <video src={a.url} preload="metadata" muted playsInline className={classNames('block max-h-80 max-w-full scale-110 blur-2xl', fill && 'w-full')} style={ratio ? { aspectRatio: ratio } : { minHeight: 160 }} />
        ) : (
          <img src={a.url} alt="" loading="lazy" className={classNames('block max-h-80 max-w-full scale-110 object-cover blur-2xl', fill ? 'w-full' : 'w-auto')} style={{ minHeight: 120, ...(ratio ? { aspectRatio: ratio } : {}) }} />
        )}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-[2px]">
          👁 Спойлер
        </span>
      </button>
    )
  }

  if (a.kind === 'video') {
    return <VideoPlayer a={a} fill={fill} />
  }
  return (
    <button
      onClick={() => setLightbox({ url: a.url, name: a.name })}
      className={classNames('block max-w-full cursor-zoom-in', fill && 'w-full')}
      title={a.kind === 'gif' ? 'GIF' : 'Открыть фото'}
    >
      <img
        src={a.url}
        alt={a.name ?? ''}
        loading="lazy"
        className={classNames('block max-h-80 max-w-full object-cover', fill ? 'w-full' : 'w-auto')}
        style={ratio ? { aspectRatio: ratio } : undefined}
      />
    </button>
  )
}

/**
 * Long messages collapse behind a «Показать полностью» toggle.
 * Channel posts render through the block formatter, which produces its own
 * paragraphs — so pre-wrap must be off there or every block would gain a blank
 * line.
 *
 * break-words is not enough on its own: a single very long token (a bare link,
 * a hash) has a min-content width of its whole length, which used to push the
 * bubble — and with it the chat pane — past the viewport. overflow-wrap:anywhere
 * lets the layout break such a token, so the bubble can actually be narrow.
 */
function LongText({ text, isMine, isPost }: { text: string; isMine: boolean; isPost?: boolean }) {
  const LIMIT = 700
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > LIMIT
  const shown = isLong && !expanded ? text.slice(0, 550).trimEnd() + '…' : text
  return (
    <>
      <div
        className={classNames('min-w-0 break-words', isPost ? 'whitespace-normal' : 'whitespace-pre-wrap')}
        style={{ overflowWrap: 'anywhere' }}
        dangerouslySetInnerHTML={isPost ? renderPost(shown) : renderRich(shown)}
      />
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          className={classNames('mt-0.5 text-xs font-bold underline-offset-2 hover:underline', isMine ? 'text-white/90' : 'accent-text')}
        >
          {expanded ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
    </>
  )
}

/** File: the row itself is the bubble content — no nested bordered box. */
function FileMedia({ a }: { a: Attachment }) {
  return (
    <a
      href={a.url}
      download={a.name}
      target="_blank"
      rel="noreferrer noopener"
      className="flex min-w-0 items-center gap-2.5 px-3 pt-2.5 no-underline sm:min-w-[220px]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-current/15">
        <FileText size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{a.name ?? 'Файл'}</span>
        <span className="block text-[11px] opacity-70">{prettySize(a.size)}</span>
      </span>
      <Download size={16} className="shrink-0 opacity-70" />
    </a>
  )
}

function PollView({ message, onVote }: { message: Message; onVote: (i: number) => void }) {
  const poll = message.poll!
  const total = poll.options.reduce((a, o) => a + o.uids.length, 0)
  return (
    <div className="min-w-0 sm:min-w-[220px]">
      <div className="mb-2 break-words font-bold">📊 {poll.question}</div>
      <div className="space-y-1.5">
        {poll.options.map((o, i) => {
          const pct = total ? Math.round((o.uids.length / total) * 100) : 0
          return (
            <button key={i} onClick={() => onVote(i)} className="relative w-full overflow-hidden rounded-lg border border-current/20 px-2.5 py-1.5 text-left text-sm">
              <div className="absolute inset-0 opacity-20" style={{ width: `${pct}%`, background: 'currentColor' }} />
              <div className="relative flex min-w-0 justify-between gap-2"><span className="min-w-0 break-words">{o.text}</span><span className="shrink-0 font-semibold">{pct}%</span></div>
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 text-[11px] opacity-70">{total} голосов{poll.multi ? ' · неск. вариантов' : ''}</div>
    </div>
  )
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} className="grid h-8 w-8 place-items-center rounded-full bg-[var(--panel)] text-[var(--muted)] shadow-sm hover:text-[var(--text)]" style={{ boxShadow: 'var(--shadow)' }}>
      {children}
    </button>
  )
}
