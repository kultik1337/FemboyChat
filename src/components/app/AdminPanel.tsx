import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { invalidatePerks, usePerks } from '../../lib/perks'
import { classNames } from '../../lib/util'
import { Avatar } from '../ui/Avatar'
import { Bot, Check, Search, Sparkles, X } from '../ui/icons'
import { playSound } from '../../lib/sound'

/**
 * The messenger's admin panel.
 *
 * Everything here is a thin skin over four RPCs; the rules live in the
 * database, where they cannot be argued with from a browser console. The panel
 * exists so that granting somebody premium, a verified tick or the right to
 * build bots is a tap rather than a SQL statement typed at two in the morning.
 *
 * The list deliberately shows two different things: with an empty search box it
 * is «everyone who already has a perk» — a short, useful audit list — and with
 * a query it becomes people search, so granting something new does not require
 * knowing anyone's uid.
 */

interface Row {
  uid: string
  username: string
  name: string
  num_id: number
  emoji: string
  color: string
  avatar_url: string | null
  is_admin: boolean
  can_create_bots: boolean
  premium: boolean
  verified: boolean
  max_bots: number
  note: string | null
}

type BoolPerk = 'is_admin' | 'can_create_bots' | 'premium' | 'verified'

const PERK_LABELS: Array<{ key: BoolPerk; label: string; hint: string }> = [
  { key: 'premium', label: 'Премиум', hint: 'Оформление и повышенные лимиты' },
  { key: 'verified', label: 'Галочка', hint: 'Подтверждённый аккаунт' },
  { key: 'can_create_bots', label: 'Боты', hint: 'Может создавать своих ботов' },
  { key: 'is_admin', label: 'Админ', hint: 'Полный доступ к этой панели' },
]

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const backend = useStore((s) => s.backend)
  const toast = useStore((s) => s.toast)
  const me = useStore((s) => s.account?.uid)
  const perks = usePerks()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  /** uid currently being written, so its row can show that it is busy. */
  const [busy, setBusy] = useState<string | null>(null)

  // Debounced, because typing a username should not mean a request per letter.
  useEffect(() => {
    let alive = true
    setLoading(true)
    const timer = setTimeout(async () => {
      const raw = await backend?.rpc?.('list_perks', { q: query.trim() || null, lim: 60 })
      if (!alive) return
      setRows(Array.isArray(raw) ? (raw as Row[]) : [])
      setLoading(false)
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query, backend])

  async function toggle(row: Row, perk: BoolPerk) {
    const value = !row[perk]
    setBusy(row.uid)
    const res = await backend?.rpc?.('set_perk', { target: row.uid, perk, value })
    setBusy(null)
    if (!res) {
      playSound('error')
      toast('Не получилось изменить права', '⚠️')
      return
    }
    playSound('success')
    setRows((list) => list.map((r) => (r.uid === row.uid ? { ...r, [perk]: value } : r)))
    // Changing your own perks changes what the rest of the app offers you.
    if (row.uid === me) invalidatePerks()
  }

  async function setQuota(row: Row, value: number) {
    setBusy(row.uid)
    const res = await backend?.rpc?.('set_max_bots', { target: row.uid, value })
    setBusy(null)
    if (!res) {
      playSound('error')
      toast('Не получилось изменить лимит', '⚠️')
      return
    }
    setRows((list) => list.map((r) => (r.uid === row.uid ? { ...r, max_bots: value } : r)))
    if (row.uid === me) invalidatePerks()
  }

  if (!perks.is_admin) {
    return (
      <Shell onClose={onClose} title="Админка">
        <div className="grid place-items-center gap-2 py-12 text-center text-sm text-[var(--muted)]">
          <Sparkles size={28} className="accent-text" />
          Эта панель только для администраторов.
        </div>
      </Shell>
    )
  }

  return (
    <Shell onClose={onClose} title="Админка мессенджера">
      <div className="sticky top-0 z-[1] bg-[var(--panel)] pb-2">
        <label className="input flex items-center gap-2">
          <Search size={16} className="shrink-0 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени, @юзернейму или номеру"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="shrink-0 text-[var(--muted)] hover:text-[var(--text)]">
              <X size={15} />
            </button>
          )}
        </label>
        <div className="px-1 pt-2 text-[11px] text-[var(--muted)]">
          {query.trim() ? 'Результаты поиска' : 'Все, у кого уже есть плюшки'}
        </div>
      </div>

      {loading && <div className="py-8 text-center text-sm text-[var(--muted)]">Загружаем…</div>}

      {!loading && rows.length === 0 && (
        <div className="py-8 text-center text-sm text-[var(--muted)]">
          {query.trim() ? 'Никого не нашлось' : 'Пока никому ничего не выдано'}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.uid}
            className={classNames(
              'rounded-2xl border border-[var(--border)] p-3 transition',
              busy === row.uid && 'opacity-60',
            )}
          >
            <div className="flex items-center gap-2">
              <Avatar emoji={row.emoji} color={row.color} src={row.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{row.name || row.username}</div>
                <div className="truncate text-xs text-[var(--muted)]">@{row.username} · #{row.num_id}</div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {PERK_LABELS.map((p) => {
                const on = row[p.key]
                return (
                  <button
                    key={p.key}
                    title={p.hint}
                    onClick={() => void toggle(row, p.key)}
                    className={classNames(
                      'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                      on
                        ? 'border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-hover)]',
                    )}
                  >
                    {on && <Check size={12} strokeWidth={2.4} />}
                    {p.label}
                  </button>
                )
              })}
            </div>

            {row.can_create_bots && (
              <label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                <Bot size={14} />
                Лимит ботов
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={row.max_bots}
                  onChange={(e) => void setQuota(row, Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                  className="input w-20 py-1 text-xs"
                />
              </label>
            )}
          </div>
        ))}
      </div>
    </Shell>
  )
}

/** Shared frame, so the «not an admin» state looks like the panel it replaces. */
function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="animate-pop-in flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0 flex-1 truncate text-sm font-bold">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
            <X size={16} />
          </button>
        </div>
        <div className="fancy-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  )
}
