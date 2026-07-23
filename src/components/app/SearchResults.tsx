import { Bot, Hash, Megaphone, Users } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import type { Directory, EntityKind } from '../../types'

const KIND: Record<EntityKind, { label: string; icon: typeof Bot }> = {
  user: { label: 'Люди', icon: Users },
  bot: { label: 'Боты', icon: Bot },
  group: { label: 'Группы', icon: Hash },
  channel: { label: 'Каналы', icon: Megaphone },
}
const ORDER: EntityKind[] = ['user', 'group', 'channel', 'bot']

export function SearchResults() {
  const results = useStore((s) => s.searchResults)
  const query = useStore((s) => s.searchQuery)
  const startWith = useStore((s) => s.startWith)

  const groups = ORDER.map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) })).filter((g) => g.items.length)

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
        {query.trim() ? 'Результаты поиска' : 'Рекомендации'}
      </div>
      {results.length === 0 && (
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
              <ResultRow key={r.uid} r={r} onClick={() => startWith(r)} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ResultRow({ r, onClick }: { r: Directory; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-[var(--panel-hover)]">
      <Avatar emoji={r.emoji} color={r.color} size={46} online={r.kind === 'user' ? r.online : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate font-semibold">{r.name}</span>
          {r.verified && <span className="text-[var(--accent)]">✔</span>}
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
