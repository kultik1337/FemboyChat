import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Modal } from '../ui/Modal'
import { classNames } from '../../lib/util'

/** One row of public.chat_invites. */
type Invite = {
  code: string
  chat_id: string
  created_by: string
  label: string | null
  max_uses: number | null
  uses: number
  expires_at: string | null
  revoked: boolean
  created_at: string
}

const USES_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Без лимита' },
  { value: 1, label: '1 человек' },
  { value: 5, label: '5 человек' },
  { value: 25, label: '25 человек' },
  { value: 100, label: '100 человек' },
]

const TTL_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Бессрочно' },
  { value: 1, label: '1 час' },
  { value: 24, label: 'Сутки' },
  { value: 24 * 7, label: 'Неделя' },
]

function linkFor(code: string) {
  return `${location.origin}/#join=${code}`
}

function expiryLabel(iso: string | null) {
  if (!iso) return 'бессрочно'
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'истёк'
  const hours = Math.round(ms / 3_600_000)
  if (hours < 1) return `ещё ${Math.max(1, Math.round(ms / 60_000))} мин`
  if (hours < 48) return `ещё ${hours} ч`
  return `ещё ${Math.round(hours / 24)} дн`
}

function isDead(inv: Invite) {
  if (inv.revoked) return true
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return true
  if (inv.max_uses != null && inv.uses >= inv.max_uses) return true
  return false
}

/**
 * Invite links with limits. The chat used to have exactly one eternal code,
 * which meant "revoking" it kicked every other copy of the link at the same
 * time. Each link is now its own object: it can be one-shot, time-boxed,
 * labelled («for the design chat») and killed on its own.
 */
export function InviteManager({ chatId, open, onClose }: { chatId: string; open: boolean; onClose: () => void }) {
  const backend = useStore((s) => s.backend)!
  const toast = useStore((s) => s.toast)
  const [rows, setRows] = useState<Invite[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState(0)
  const [ttl, setTtl] = useState(0)

  const reload = useCallback(async () => {
    const res = await backend.rpc?.('list_chat_invites', { p_chat: chatId })
    setRows(Array.isArray(res) ? (res as Invite[]) : [])
  }, [backend, chatId])

  useEffect(() => {
    if (!open) return
    void reload()
  }, [open, reload])

  async function create() {
    setBusy(true)
    try {
      const res = await backend.rpc?.('create_chat_invite', {
        p_chat: chatId,
        p_max_uses: maxUses,
        p_ttl_hours: ttl,
        p_label: label.trim() || null,
      })
      const made = (Array.isArray(res) ? res[0] : res) as Invite | null
      if (!made?.code) throw new Error('Не получилось создать ссылку')
      await navigator.clipboard.writeText(linkFor(made.code)).catch(() => {})
      setLabel('')
      await reload()
      toast('Ссылка создана и скопирована', '💌')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось', '⚠️')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(code: string) {
    try {
      await backend.rpc?.('revoke_chat_invite', { p_code: code })
      await reload()
      toast('Ссылка отозвана', '🚫')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось', '⚠️')
    }
  }

  function copy(code: string) {
    navigator.clipboard.writeText(linkFor(code)).then(
      () => toast('Ссылка скопирована', '📋'),
      () => toast('Не удалось скопировать', '⚠️'),
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Приглашения">
      <div className="rounded-2xl border border-[var(--border)] p-3">
        <div className="mb-2 text-xs font-bold uppercase text-[var(--muted)]">Новая ссылка</div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Название, чтобы не путаться — необязательно"
          className="input mb-2 text-sm"
        />
        <div className="mb-1 text-xs text-[var(--muted)]">Сколько человек могут войти</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {USES_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setMaxUses(o.value)}
              className={classNames('chip', maxUses === o.value && '!bg-[var(--accent)] !text-[var(--accent-contrast)]')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="mb-1 text-xs text-[var(--muted)]">Сколько живёт</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TTL_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setTtl(o.value)}
              className={classNames('chip', ttl === o.value && '!bg-[var(--accent)] !text-[var(--accent-contrast)]')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button onClick={create} disabled={busy} className="btn-primary w-full disabled:opacity-60">
          <Link2 size={17} /> {busy ? 'Создаём…' : 'Создать и скопировать'}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {rows === null && <div className="text-sm text-[var(--muted)]">Загружаем…</div>}
        {rows?.length === 0 && (
          <div className="rounded-2xl bg-[var(--panel-2)] p-3 text-sm text-[var(--muted)]">
            Ссылок пока нет. Создай одноразовую — её нельзя будет передать дальше.
          </div>
        )}
        {rows?.map((inv) => {
          const dead = isDead(inv)
          return (
            <div
              key={inv.code}
              className={classNames('rounded-2xl border border-[var(--border)] p-3', dead && 'opacity-55')}
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{inv.label || `Ссылка ${inv.code.slice(0, 6)}`}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {inv.max_uses == null ? 'без лимита' : `${inv.uses} из ${inv.max_uses}`} · {expiryLabel(inv.expires_at)}
                    {inv.revoked ? ' · отозвана' : ''}
                  </div>
                </div>
                {!dead && (
                  <button
                    onClick={() => copy(inv.code)}
                    className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--panel-hover)]"
                    title="Скопировать"
                  >
                    <Copy size={16} />
                  </button>
                )}
                {!inv.revoked && (
                  <button
                    onClick={() => revoke(inv.code)}
                    className="grid h-9 w-9 place-items-center rounded-full text-rose-500 hover:bg-rose-500/10"
                    title="Отозвать"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
