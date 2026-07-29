import { useState } from 'react'
import { Check, CheckCheck, Clock, CornerUpLeft, Download, FileText, MoreHorizontal, Smile } from 'lucide-react'
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
import type { Person } from './people'

const emojiOnly = (t: string) => /^\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic}|\ufe0f|\s)*$/u.test(t.trim()) && [...t.trim()].length <= 6

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
}) {
  const react = useStore((s) => s.react)
  const vote = useStore((s) => s.vote)
  const account = useStore((s) => s.account)
  const setProfileUid = useStore((s) => s.setProfileUid)
  const setComposeReply = useStore((s) => s.setComposeReply)
  const { messageMenu } = useActions()
  const [pop, setPop] = useState(false)

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

  // Telegram-style stacked corners: tighten the corner on the sender's side
  // between consecutive messages, keep the outer "tail" corners round.
  const R = 'var(--radius-bubble)'
  const tight = '7px'
  const near = { top: firstOfGroup ? R : tight, bot: showAvatar ? R : tight }
  const radius = isMine
    ? `${R} ${near.top} ${near.bot} ${R}`
    : `${near.top} ${R} ${R} ${near.bot}`

  const buildHeader = (withName: boolean) => {
    const showNameHere = withName && showName
    if (!showNameHere && !message.forwardedFrom && !repliedMessage) return null
    return (
      <>
        {showNameHere && (
          <button onClick={() => setProfileUid(sender.uid)} className="mb-0.5 block text-xs font-bold" style={{ color: sender.color }}>
            {sender.name}
          </button>
        )}
        {message.forwardedFrom && <div className="mb-0.5 text-[11px] opacity-70">↪ переслано</div>}
        {repliedMessage && (
          <button
            onClick={() => onJump?.(repliedMessage.id)}
            className="mb-1 block w-full border-l-2 pl-2 text-left text-[0.8rem] opacity-90 transition hover:opacity-100"
            style={{ borderColor: isMine ? 'rgba(255,255,255,0.7)' : 'var(--accent)' }}
          >
            <div className="font-semibold">{repliedSender?.name ?? 'Сообщение'}</div>
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
    <div className="mt-1 flex flex-wrap items-end justify-end gap-x-2 gap-y-1">
      {reactionPills(false)}
      <span className="ml-auto">{meta(false)}</span>
    </div>
  )

  return (
    <div
      id={`msg-${message.id}`}
      className={classNames('group flex gap-2 px-3 sm:px-4', isMine ? 'flex-row-reverse' : 'flex-row', firstOfGroup ? 'mt-4' : 'mt-1', fresh && 'animate-fade-in')}
      onContextMenu={message.deleted ? undefined : openMenu}
      onDoubleClick={quickReact}
    >
      {!isMine && chat.type === 'group' ? (
        showAvatar ? (
          <button onClick={() => setProfileUid(sender.uid)} className="mt-auto">
            <Avatar emoji={sender.emoji} color={sender.color} src={sender.avatarUrl} size={32} />
          </button>
        ) : (
          <div className="w-8 shrink-0" />
        )
      ) : null}

      <div className={classNames('relative max-w-[76%] sm:max-w-[68%]', isMine ? 'items-end' : 'items-start')}>
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
            className="relative px-3.5 py-2 text-[0.95rem] leading-relaxed shadow-sm"
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
      <div className="relative max-w-[380px] overflow-hidden shadow-sm" style={{ borderRadius: radius }}>
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
      className={classNames('overflow-hidden text-[0.95rem] leading-relaxed shadow-sm', isVisual && 'max-w-[380px]')}
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
      <div className={classNames('px-3 pb-1.5', caption ? 'pt-1.5' : 'pt-0')}>
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
          <video src={a.url} preload="metadata" muted playsInline className={classNames('block max-h-80 max-w-full scale-110 blur-2xl', fill && 'w-full')} style={ratio ? { aspectRatio: ratio } : { minHeight: 160, minWidth: 200 }} />
        ) : (
          <img src={a.url} alt="" loading="lazy" className={classNames('block max-h-80 max-w-full scale-110 object-cover blur-2xl', fill ? 'w-full' : 'w-auto')} style={{ minWidth: 200, minHeight: 120, ...(ratio ? { aspectRatio: ratio } : {}) }} />
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
        style={{ minWidth: 140, ...(ratio ? { aspectRatio: ratio } : {}) }}
      />
    </button>
  )
}

/**
 * Long messages collapse behind a «Показать полностью» toggle.
 * Channel posts render through the block formatter, which produces its own
 * paragraphs — so pre-wrap must be off there or every block would gain a blank
 * line.
 */
function LongText({ text, isMine, isPost }: { text: string; isMine: boolean; isPost?: boolean }) {
  const LIMIT = 700
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > LIMIT
  const shown = isLong && !expanded ? text.slice(0, 550).trimEnd() + '…' : text
  return (
    <>
      <div
        className={classNames('break-words', isPost ? 'whitespace-normal' : 'whitespace-pre-wrap')}
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
      className="flex min-w-[220px] items-center gap-2.5 px-3 pt-2.5 no-underline"
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
    <div className="min-w-[220px]">
      <div className="mb-2 font-bold">📊 {poll.question}</div>
      <div className="space-y-1.5">
        {poll.options.map((o, i) => {
          const pct = total ? Math.round((o.uids.length / total) * 100) : 0
          return (
            <button key={i} onClick={() => onVote(i)} className="relative w-full overflow-hidden rounded-lg border border-current/20 px-2.5 py-1.5 text-left text-sm">
              <div className="absolute inset-0 opacity-20" style={{ width: `${pct}%`, background: 'currentColor' }} />
              <div className="relative flex justify-between"><span>{o.text}</span><span className="font-semibold">{pct}%</span></div>
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
