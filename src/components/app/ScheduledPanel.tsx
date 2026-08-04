import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { useStore } from '../../store/useStore'
import {
  cancelScheduled,
  isScheduleAvailable,
  listScheduled,
  scheduleMessage,
  type ScheduledMessage,
} from '../../lib/scheduled'

/** Событие, которым окно открывается извне. */
export const OPEN_SCHEDULED_EVENT = 'fc:open-scheduled'

/**
 * Значение для `datetime-local`: этот вид поля ждёт местное время без зоны,
 * поэтому `toISOString()` здесь не годится — он отдаёт UTC и сдвигает время
 * на часовой пояс.
 */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** По умолчанию — через час: самый частый смысл «напомни позже». */
function defaultWhen(): string {
  return toLocalInput(new Date(Date.now() + 60 * 60 * 1000))
}

function whenLabel(ms: number): string {
  return new Date(ms).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Отложенные сообщения: список заготовок и форма новой.
 *
 * Отправкой занимается сервер, поэтому закрытые вкладка и выключенный
 * компьютер ничего не меняют. В демо-режиме сервера нет, и окно об этом
 * говорит прямо, а не делает вид, что очередь работает.
 */
export function ScheduledPanel() {
  const chats = useStore((s) => s.chats)
  const toast = useStore((s) => s.toast)

  const [open, setOpen] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [items, setItems] = useState<ScheduledMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [chatId, setChatId] = useState('')
  const [text, setText] = useState('')
  const [when, setWhen] = useState(defaultWhen)

  // Открытие: событием извне или с клавиатуры.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener(OPEN_SCHEDULED_EVENT, onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(OPEN_SCHEDULED_EVENT, onOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await listScheduled())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let alive = true
    void isScheduleAvailable().then((ok) => {
      if (!alive) return
      setAvailable(ok)
      if (ok) void refresh()
    })
    return () => {
      alive = false
    }
  }, [open, refresh])

  // Первый чат как заготовка выбора, чтобы не заставлять тыкать в список ради
  // очевидного случая «один активный диалог».
  useEffect(() => {
    if (!chatId && chats.length > 0) setChatId(chats[0].id)
  }, [chats, chatId])

  const add = async () => {
    const body = text.trim()
    if (!body || !chatId) return
    const at = new Date(when).getTime()
    if (!Number.isFinite(at)) {
      toast('Не понял время — выбери дату и время заново', '⏰')
      return
    }
    if (at < Date.now() + 60 * 1000) {
      toast('Время должно быть хотя бы на минуту вперёд', '⏰')
      return
    }
    setBusy(true)
    try {
      const made = await scheduleMessage({ chatId, text: body, sendAt: at })
      if (!made) {
        toast('Не удалось отложить сообщение', '⚠️')
        return
      }
      setText('')
      setWhen(defaultWhen())
      toast(`Отправится ${whenLabel(made.sendAt)}`, '⏳')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const drop = async (id: string) => {
    if (!(await cancelScheduled(id))) {
      toast('Не удалось отменить — возможно, сообщение уже ушло', '⚠️')
    }
    await refresh()
  }

  const chatTitle = (id: string) => chats.find((c) => c.id === id)?.title ?? 'Удалённый чат'

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Отложенные сообщения" wide>
      {available === false ? (
        <p className="text-sm text-[var(--muted)]">
          В демо-режиме отложенная отправка не работает: сообщение должен отправить сервер,
          а его здесь нет. Зайди в аккаунт на сайте или в приложении.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Куда</label>
            <select className="input" value={chatId} onChange={(e) => setChatId(e.target.value)}>
              {chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            <label className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Текст</label>
            <textarea
              className="input min-h-[90px] resize-y"
              placeholder="Что отправить…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <label className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Когда</label>
            <input
              className="input"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />

            <button
              className="btn-primary mt-3 self-start"
              disabled={busy || !text.trim() || !chatId}
              onClick={() => void add()}
            >
              {busy ? 'Откладываю…' : 'Отложить'}
            </button>
          </div>

          <div className="h-px bg-[var(--border)]" />

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              В очереди{items.length > 0 ? ` · ${items.length}` : ''}
            </div>

            {loading && <div className="text-sm text-[var(--muted)]">Загружаю…</div>}

            {!loading && items.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Пусто. Отложенное сообщение уйдёт само — даже если вкладка закрыта,
                а компьютер выключен.
              </p>
            )}

            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{chatTitle(it.chatId)}</div>
                  <div className="truncate text-sm text-[var(--muted)]">{it.text || it.sticker}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{whenLabel(it.sendAt)}</div>
                </div>
                <button className="btn-ghost shrink-0" onClick={() => void drop(it.id)}>
                  Отменить
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
