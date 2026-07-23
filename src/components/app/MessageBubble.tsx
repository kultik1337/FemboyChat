import { Check, CheckCheck, Clock, CornerUpLeft, MoreHorizontal, Smile } from 'lucide-react'
import type { Chat, Message } from '../../types'
import { classNames, renderRich, timeShort } from '../../lib/util'
import { useStore } from '../../store/useStore'
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
  showName,
  showAvatar,
  repliedMessage,
  repliedSender,
  now,
  bigEmoji,
  otherUid,
}: {
  message: Message
  chat: Chat
  isMine: boolean
  sender: Person
  showName: boolean
  showAvatar: boolean
  repliedMessage?: Message
  repliedSender?: Person
  now: number
  bigEmoji: boolean
  otherUid?: string
}) {
  const react = useStore((s) => s.react)
  const vote = useStore((s) => s.vote)
  const account = useStore((s) => s.account)
  const setProfileUid = useStore((s) => s.setProfileUid)
  const setComposeReply = useStore((s) => s.setComposeReply)
  const { messageMenu } = useActions()

  function openMenu(e: React.MouseEvent) {
    const { items, reactions } = messageMenu(message)
    openContextMenu(e, items, { reactions })
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

  return (
    <div
      className={classNames('group flex gap-2 px-3 sm:px-4', isMine ? 'flex-row-reverse' : 'flex-row', showAvatar ? 'mt-4' : 'mt-1.5')}
      onContextMenu={message.deleted ? undefined : openMenu}
    >
      {!isMine && chat.type === 'group' ? (
        showAvatar ? (
          <button onClick={() => setProfileUid(sender.uid)} className="mt-auto">
            <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${sender.color}, ${sender.color})`, fontSize: 15 }}>
              {sender.emoji}
            </span>
          </button>
        ) : (
          <div className="w-8 shrink-0" />
        )
      ) : null}

      <div className={classNames('relative max-w-[76%] sm:max-w-[68%]', isMine ? 'items-end' : 'items-start')}>
        {message.sticker ? (
          <div className={classNames('flex', isMine ? 'justify-end' : 'justify-start')}>
            <Sticker emoji={message.sticker} size={124} />
          </div>
        ) : message.deleted ? (
          <div className="rounded-2xl border border-[var(--border)] px-3.5 py-2 text-sm italic text-[var(--muted)]">сообщение удалено</div>
        ) : big ? (
          <div className={classNames('text-5xl leading-tight', isMine ? 'text-right' : 'text-left')}>{message.text}</div>
        ) : (
          <div
            className="relative px-3.5 py-2 text-[0.95rem] leading-relaxed shadow-sm"
            style={{
              borderRadius: 'var(--radius-bubble)',
              background: isMine ? 'var(--bubble-out)' : 'var(--bubble-in)',
              color: isMine ? 'var(--bubble-out-text)' : 'var(--bubble-in-text)',
            }}
          >
            {showName && !isMine && chat.type === 'group' && (
              <button onClick={() => setProfileUid(sender.uid)} className="mb-0.5 block text-xs font-bold" style={{ color: sender.color }}>
                {sender.name}
              </button>
            )}
            {message.forwardedFrom && <div className="mb-0.5 text-[11px] opacity-70">↪ переслано</div>}
            {repliedMessage && (
              <div className="mb-1 border-l-2 pl-2 text-[0.8rem] opacity-90" style={{ borderColor: isMine ? 'rgba(255,255,255,0.7)' : 'var(--accent)' }}>
                <div className="font-semibold">{repliedSender?.name ?? 'Сообщение'}</div>
                <div className="truncate opacity-80">{repliedMessage.sticker ? 'стикер' : repliedMessage.text}</div>
              </div>
            )}

            {message.poll ? (
              <PollView message={message} onVote={(i) => vote(message.id, i)} />
            ) : (
              <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={renderRich(message.text)} />
            )}

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
