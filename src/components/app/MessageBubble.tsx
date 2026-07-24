import { useState } from 'react'
import { Check, CheckCheck, Clock, CornerUpLeft, Download, FileText, MoreHorizontal, Smile } from 'lucide-react'
import type { Attachment, Chat, Message } from '../../types'
import { classNames, renderRich, timeShort } from '../../lib/util'
import { attachmentLabel, prettySize } from '../../lib/media'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { Sticker } from '../ui/Sticker'
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
  const big = bigEmoji && !message.sticker && emojiOnly(message.text)
  const showName = firstOfGroup && !isMine && chat.type === 'group'

  // Telegram-style stacked corners: tighten the corner on the sender's side
  // between consecutive messages, keep the outer "tail" corners round.
  const R = 'var(--radius-bubble)'
  const tight = '7px'
  const near = { top: firstOfGroup ? R : tight, bot: showAvatar ? R : tight }
  const radius = isMine
    ? `${R} ${near.top} ${near.bot} ${R}`
    : `${near.top} ${R} ${R} ${near.bot}`

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
        ) : (
          <div
            className="relative px-3.5 py-2 text-[0.95rem] leading-relaxed shadow-sm"
            style={{
              borderRadius: radius,
              background: isMine ? 'var(--bubble-out)' : 'var(--bubble-in)',
              color: isMine ? 'var(--bubble-out-text)' : 'var(--bubble-in-text)',
            }}
          >
            {showName && (
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

            {message.attachment && <AttachmentView a={message.attachment} name={message.attachment.name} />}

            {message.poll ? (
              <PollView message={message} onVote={(i) => vote(message.id, i)} />
            ) : message.text ? (
              <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={renderRich(message.text)} />
            ) : null}

            <div className={classNames('mt-1 flex items-center gap-1 text-[10px]', isMine ? 'justify-end text-white/80' : 'text-[var(--muted)]')}>
              {ttlLeft > 0 && <span className="flex items-center gap-0.5"><Clock size={11} /> {ttlLeft}s</span>}
              {message.editedTs && <span>изменено</span>}
              <span>{timeShort(message.ts)}</span>
              {isMine && chat.type !== 'channel' && (read ? <CheckCheck size={13} /> : <Check size={13} />)}
            </div>
          </div>
        )}

        {message.reactions.length > 0 && (
          <div className={classNames('mt-1.5 flex flex-wrap gap-1.5', isMine ? 'justify-end' : 'justify-start')}>
            {message.reactions.map((r) => {
              const mine = account ? r.uids.includes(account.uid) : false
              return (
                <button
                  key={r.emoji}
                  onClick={() => react(message.id, r.emoji)}
                  className={classNames(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition hover:scale-105 active:scale-95',
                    mine
                      ? 'bg-[var(--accent)]/25 ring-1 ring-[var(--accent)] text-[var(--text)]'
                      : 'border border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]',
                  )}
                >
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span className="tabular-nums">{r.uids.length}</span>
                </button>
              )
            })}
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

/** Renders a media attachment inside a bubble: photo, GIF, video, voice/audio or a file card. */
function AttachmentView({ a, name }: { a: Attachment; name?: string }) {
  const setLightbox = useStore((s) => s.setLightbox)

  if (a.kind === 'image' || a.kind === 'gif') {
    const ratio = a.w && a.h ? a.w / a.h : undefined
    return (
      <button
        onClick={() => setLightbox({ url: a.url, name: name ?? a.name })}
        className="mb-1 block max-w-full cursor-zoom-in overflow-hidden rounded-xl"
        title={a.kind === 'gif' ? 'GIF' : 'Открыть фото'}
      >
        <img
          src={a.url}
          alt={a.name ?? ''}
          loading="lazy"
          className="block max-h-80 w-auto max-w-full rounded-xl object-cover"
          style={ratio ? { aspectRatio: `${a.w} / ${a.h}`, minWidth: 120 } : { minWidth: 120 }}
        />
      </button>
    )
  }

  if (a.kind === 'video') {
    return (
      <video controls preload="metadata" className="mb-1 block max-h-80 max-w-full rounded-xl" src={a.url}>
        Видео не поддерживается
      </video>
    )
  }

  if (a.kind === 'voice' || a.kind === 'audio') {
    return (
      <div className="mb-1 flex min-w-[220px] flex-col gap-1">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold opacity-90">
          {a.kind === 'voice' ? '🎤 Голосовое сообщение' : `🎵 ${a.name ?? 'Аудио'}`}
          {a.durationSec ? <span className="opacity-70">· {fmtDuration(a.durationSec)}</span> : null}
        </div>
        <audio controls preload="metadata" src={a.url} className="h-10 w-full max-w-[260px]" />
      </div>
    )
  }

  return (
    <a
      href={a.url}
      download={a.name}
      target="_blank"
      rel="noreferrer noopener"
      className="mb-1 flex min-w-[200px] items-center gap-2.5 rounded-xl border border-current/20 px-2.5 py-2 no-underline transition hover:border-current/40"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-current/15">
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

function fmtDuration(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
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
