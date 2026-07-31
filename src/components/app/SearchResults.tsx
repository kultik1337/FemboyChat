import { useEffect, useState } from 'react'
import { Bot, Hash, Megaphone, MessageSquare, Users } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { Verified } from '../ui/Verified'
import { useActions } from './useActions'
import { openContextMenu } from '../ui/ContextMenu'
import { attachmentLabel } from '../../lib/media'
import type { Attachment, Directory, EntityKind } from '../../types'

const KIND: Record<EntityKind, { label: string; icon: typeof Bot }> = {
  user: { label: 'Люди', icon: Users },
  bot: { label: 'Боты', icon: Bot },
  group: { label: 'Группы', icon: Hash },
  channel: { label: 'Каналы', icon: Megaphone },
}
const ORDER: EntityKind[] = ['user', 'group', 'channel', 'bot']

/** One hit of the `search_messages` RPC. Snake_case: it comes straight from SQL. */
type MessageHit = {
  id: string
  chat_id: string
  sender_uid: string
  text: string
  ts: string
  attachment: Attachment | null
  sticker: string | null
}

/**
 * Anyone can hold a key down, and every keystroke would otherwise be a query
 * against every message the user can read.
 */
const DEBOUNCE_MS = 260
const MIN_CHARS = 2

export function SearchResults() {
  const results = useStore((s) => s.searchResults)
  const query = useStore((s) => s.searchQuery)
  const startWith = useStore((s) => s.startWith)
  const { personMenu } = useActions()

  const hits = useMessageSearch(query)

  function menuFor(r: Directory, e: React.MouseEvent) {
    if (r.kind === 'user' || r.kind === 'bot') return openContextMenu(e, personMenu(r.uid))
    return openContextMenu(e, [{ label: 'Открыть', onClick: () => startWith(r) }])
  }

  const groups = ORDER.map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) })).filter((g) => g.items.length)
  const nothing = results.length === 0 && hits.length === 0

  return (
    <div className="fancy-scroll flex-1 overflow-y-auto px-2 pb-4">
      <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
        {query.trim() ? 'Результаты поиска' : 'Рекомендации'}
      </div>
      {nothing && (
        <div className="mt-8 px-6 text-center text-sm text-[var(--muted)]">Ничего не найдено по «{query}» 🙈</div>
      )}
      {groups.map((g) => {
        const Icon = KIND[g.kind].icon
        return (
          <div key={g.kind} className="mb-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[var(--muted)]">
              <Icon size={13} /> {KIND[g.kind].label}
            </div>
            {g.items.map((r) => (
              <ResultRow key={r.uid} r={r} onClick={() => startWith(r)} onContext={(e) => menuFor(r, e)} />
            ))}
          </div>
        )
      })}
      {hits.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[var(--muted)]">
            <MessageSquare size={13} /> Сообщения
          </div>
          {hits.map((h) => (
            <MessageRow key={h.id} hit={h} query={query} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Search across every message the server lets this account read.
 *
 * The query runs through the `rpc` escape hatch rather than a dedicated backend
 * method, because demo mode has no server at all: there `rpc` is simply absent
 * and the messages section disappears instead of erroring.
 */
function useMessageSearch(query: string): MessageHit[] {
  const backend = useStore((s) => s.backend)
  const [hits, setHits] = useState<MessageHit[]>([])

  useEffect(() => {
    const q = query.trim()
    if (!backend?.rpc || q.length < MIN_CHARS) {
      setHits([])
      return
    }
    let alive = true
    const timer = setTimeout(async () => {
      const rows = (await backend.rpc?.('search_messages', { q, lim: 40 })) as MessageHit[] | null
      // A slow response for an old query must never overwrite a newer one.
      if (alive) setHits(Array.isArray(rows) ? rows : [])
    }, DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [backend, query])

  return hits
}

function MessageRow({ hit, query }: { hit: MessageHit; query: string }) {
  const chats = useStore((s) => s.chats)
  const directory = useStore((s) => s.directory)
  const account = useStore((s) => s.account)
  const openChat = useStore((s) => s.openChat)

  const chat = chats.find((c) => c.id === hit.chat_id)
  const sender =
    hit.sender_uid === account?.uid ? 'Вы' : directory.find((d) => d.uid === hit.sender_uid)?.name ?? 'Собеседник'
  const when = new Date(hit.ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  const preview = hit.text || (hit.attachment ? attachmentLabel(hit.attachment) : hit.sticker ? `${hit.sticker} стикер` : '')

  async function open() {
    await openChat(hit.chat_id)
    // The chat view listens for this and scrolls to the message when it is in
    // the loaded page; older hits simply open the conversation.
    window.dispatchEvent(new CustomEvent('fc:jump', { detail: { chatId: hit.chat_id, messageId: hit.id } }))
  }

  return (
    <button
      onClick={open}
      className="flex w-full items-start gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-[var(--panel-hover)]"
    >
      <Avatar emoji={chat?.emoji ?? '💬'} color={chat?.color ?? '#7c9cff'} src={chat?.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{chat?.title ?? 'Чат'}</span>
          <span className="shrink-0 text-[11px] text-[var(--muted)]">{when}</span>
        </div>
        <div className="truncate text-xs text-[var(--muted)]">
          <span className="font-semibold">{sender}: </span>
          <Highlight text={preview} query={query} />
        </div>
      </div>
    </button>
  )
}

/** Bold the matched fragment so it is obvious why a row is in the list. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  // Keep a little context in front of a match that sits deep in a long message.
  const from = at > 24 ? at - 20 : 0
  return (
    <>
      {from > 0 && '…'}
      {text.slice(from, at)}
      <span className="font-bold text-[var(--text)]">{text.slice(at, at + q.length)}</span>
      {text.slice(at + q.length)}
    </>
  )
}

function ResultRow({ r, onClick, onContext }: { r: Directory; onClick: () => void; onContext: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} onContextMenu={onContext} className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-[var(--panel-hover)]">
      <Avatar emoji={r.emoji} color={r.color} src={r.avatarUrl} size={46} online={r.kind === 'user' ? r.online : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate font-semibold">{r.name}</span>
          {r.verified && <Verified size={15} />}
        </div>
        <div className="truncate text-xs text-[var(--muted)]">
          {r.username ? `@${r.username}` : ''}
          {r.kind === 'user' && r.numId ? ` · #${r.numId}` : ''}
          {typeof r.members === 'number' ? ` · ${r.members.toLocaleString('ru-RU')} подписчиков` : ''}
          {r.bio ? ` · ${r.bio}` : ''}
        </div>
      </div>
    </button>
  )
}
