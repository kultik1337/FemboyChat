/*
  Жалоба на сообщение, человека или чат.

  Цель жалобы живёт в отдельном сторе, а не в состоянии компонента,
  который её открывает. Причина простая: пункт меню закрывает контекстное
  меню сразу после клика, так что диалог, смонтированный внутри меню,
  исчез бы вместе с ним в тот же кадр.

  Сервер ничего не решает сам: report_content только кладёт запись в reports,
  а дальше её разбирает администрация во вкладке «Жалобы».
*/
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { Flag, X } from 'lucide-react'
import { classNames } from '../../lib/util'
import { reportContent } from '../../lib/admin'
import { useStore } from '../../store/useStore'

export type ReportTargetType = 'message' | 'chat' | 'user'

export interface ReportTarget {
  type: ReportTargetType
  id: string
  /** Короткая подсказка человеку, на что именно он жалуется. */
  title?: string
}

interface ReportStore {
  target: ReportTarget | null
  open: (t: ReportTarget) => void
  close: () => void
}

const useReport = create<ReportStore>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}))

/** Открыть форму жалобы из любого места, включая пункты контекстных меню. */
export function openReport(target: ReportTarget) {
  useReport.getState().open(target)
}

const KIND_LABEL: Record<ReportTargetType, string> = {
  message: 'сообщение',
  chat: 'чат',
  user: 'пользователя',
}

const REASONS: Array<{ icon: string; label: string }> = [
  { icon: '📣', label: 'Спам или реклама' },
  { icon: '😠', label: 'Оскорбления и травля' },
  { icon: '🔞', label: 'NSFW без предупреждения' },
  { icon: '🎣', label: 'Обман или мошенничество' },
  { icon: '🚨', label: 'Угрозы или опасное поведение' },
  { icon: '⛔', label: 'Незаконный контент' },
  { icon: '✍️', label: 'Другое' },
]

const MAX_NOTE = 500

/**
 * Глобальный хост формы жалобы. Рендерится один раз рядом с контекстным
 * меню и ничего не стоит, пока цели нет.
 */
export function ReportHost() {
  const target = useReport((s) => s.target)
  const close = useReport((s) => s.close)
  const toast = useStore((s) => s.toast)
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // Новая жалоба — чистая форма, иначе причина от прошлого раза уедет не туда.
  useEffect(() => {
    setReason(null)
    setNote('')
    setBusy(false)
  }, [target?.type, target?.id])

  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, close])

  if (!target) return null

  const send = async () => {
    if (!reason || busy) return
    setBusy(true)
    const res = await reportContent(target.type, target.id, reason, note.trim() || undefined)
    setBusy(false)
    if (res === null || res === false) {
      toast('Не удалось отправить жалобу — попробуй ещё раз', '⚠️')
      return
    }
    close()
    toast('Жалоба отправлена — администрация посмотрит', '🚩')
  }

  return (
    <div className="fixed inset-0 z-[85] grid place-items-end bg-black/50 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-4" onMouseDown={close}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--panel)] sm:max-w-md sm:rounded-3xl animate-pop-in"
        style={{ boxShadow: 'var(--shadow)' }}
      >
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-500">
            <Flag size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-[var(--text)]">Пожаловаться на {KIND_LABEL[target.type]}</h3>
            {target.title && <div className="truncate text-xs text-[var(--muted)]">{target.title}</div>}
          </div>
          <button
            onClick={close}
            aria-label="Закрыть"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="fancy-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Причина</div>
          <div className="flex flex-col gap-1.5">
            {REASONS.map((r) => (
              <button
                key={r.label}
                onClick={() => setReason(r.label)}
                className={classNames(
                  'flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition',
                  reason === r.label
                    ? 'border-[var(--accent)] bg-[var(--panel-2)] text-[var(--text)] ring-2 ring-[var(--ring)]'
                    : 'border-[var(--border)] text-[var(--text)] hover:bg-[var(--panel-hover)]',
                )}
              >
                <span className="emoji text-lg leading-none">{r.icon}</span>
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                {reason === r.label && <span className="accent-text font-bold">✓</span>}
              </button>
            ))}
          </div>

          <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
            Комментарий — необязательно
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            rows={3}
            placeholder="Что именно не так? Чем подробнее, тем быстрее разберёмся"
            className="input resize-none text-sm"
          />
          <div className="mt-1 text-right text-[11px] text-[var(--muted)]">
            {note.length} / {MAX_NOTE}
          </div>

          <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-xs text-[var(--muted)]">
            Жалобу увидит только администрация. Автор не узнает, что жаловался именно ты.
          </div>
        </div>

        <div className="safe-bottom flex shrink-0 gap-2 border-t border-[var(--border)] px-4 py-3">
          <button onClick={close} className="btn-ghost flex-1">
            Отмена
          </button>
          <button onClick={() => void send()} disabled={!reason || busy} className="btn-primary flex-1">
            {busy ? 'Отправляем…' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}
