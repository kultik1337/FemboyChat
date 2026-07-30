import { useEffect, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Check, Forward, Loader2, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { classNames } from '../../lib/util'
import type { Chat, Message } from '../../types'

/**
 * «Переслать…» — pick one or more chats and send a copy of a message there.
 *
 * It mounts itself into its own root next to the app rather than living inside
 * a component tree, because the only thing that opens it is a context-menu
 * callback built by `useActions`, which is a hook and renders nothing. The
 * store is a plain zustand module, so a detached root sees exactly the same
 * state -- there is no context to inherit.
 */

/** What the row under the title shows for a message with no text. */
function previewOf(m: Message): string {
  if (m.deleted) return 'удалённое сообщение'
  if (m.text) return m.text
  if (m.sticker) return 'стикер'
  if (m.poll) return `опрос · ${m.poll.question}`
  switch (m.attachment?.kind) {
    case 'image': return 'фото'
    case 'gif': return 'GIF'
    case 'video': return 'видео'
    case 'voice': return 'голосовое'
    case 'audio': return 'аудио'
    case 'file': return m.attachment.name ?? 'файл'
    default: return 'сообщение'
  }
}

function ForwardPicker({ message, onClose }: { message: Message; onClose: () => void }) {
  const chats = useStore((s) => s.chats)
  const account = useStore((s) => s.account)
  const toast = useStore((s) => s.toast)
  const openChat = useStore((s) => s.openChat)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState<string[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const list = useMemo(() => {
    const uid = account?.uid ?? ''
    // A channel only accepts posts from its admins, so offering the rest would
    // just produce a server rejection after the tap.
    const canPost = (c: Chat) => c.type !== 'channel' || c.ownerUid === uid || c.adminUids.includes(uid)
    const query = q.trim().toLowerCase()
    return chats
      .filter(canPost)
      .filter((c) => !query || c.title.toLowerCase().includes(query) || (c.username ?? '').toLowerCase().includes(query))
  }, [chats, q, account?.uid])

  async function forwardTo(chat: Chat) {
    const st = useStore.getState()
    if (!st.account || busy) return
    setBusy(chat.id)
    try {
      await st.backend!.send({
        chatId: chat.id,
        senderUid: st.account.uid,
        text: message.text,
        sticker: message.sticker,
        attachment: message.attachment,
        poll: message.poll,
        // Forwarding a forward keeps pointing at the person who wrote it.
        forwardedFrom: message.forwardedFrom ?? message.senderUid,
      })
      setSent((s) => [...s, chat.id])
      if (st.activeChatId === chat.id) await openChat(chat.id)
      toast(`Переслано → ${chat.title}`, '➡️')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось переслать', '⚠️')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-end sm:place-items-center p-0 sm:p-4" style={{ background: 'rgba(10,6,14,0.45)' }} onMouseDown={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl animate-pop-in sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Forward size={18} className="text-[var(--accent)]" />
          <h3 className="min-w-0 flex-1 truncate text-base font-bold">Переслать сообщение</h3>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]" title="Закрыть">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-[var(--border)] px-4 py-2.5">
          <div className="truncate rounded-xl bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--muted)]">{previewOf(message)}</div>
        </div>

        <div className="px-4 py-2.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Куда переслать?"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>

        <div className="fancy-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {list.length === 0 && <div className="px-3 py-8 text-center text-sm text-[var(--muted)]">Ничего не нашлось 🥺</div>}
          {list.map((c) => {
            const done = sent.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => forwardTo(c)}
                disabled={!!busy}
                className={classNames(
                  'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-[var(--panel-hover)] disabled:opacity-60',
                  done && 'opacity-70',
                )}
              >
                <Avatar emoji={c.emoji} color={c.color} src={c.avatarUrl} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c.title}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {c.type === 'saved' ? 'Избранное' : c.type === 'channel' ? 'канал' : c.type === 'group' ? 'группа' : c.username ? `@${c.username}` : 'личный чат'}
                  </div>
                </div>
                {busy === c.id ? (
                  <Loader2 size={18} className="shrink-0 animate-spin text-[var(--accent)]" />
                ) : done ? (
                  <Check size={18} className="shrink-0 text-[var(--accent)]" />
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

let host: HTMLDivElement | null = null
let root: Root | null = null

/** Open the picker for one message. Safe to call repeatedly. */
export function openForward(message: Message): void {
  if (typeof document === 'undefined') return
  if (!host) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  }
  const close = () => root?.render(null)
  root?.render(<ForwardPicker message={message} onClose={close} />)
}
