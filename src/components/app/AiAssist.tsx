import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { askAboutChat, suggestReplies, summariseUnread } from '../../lib/assist'
import { X } from '../ui/icons'
import { classNames } from '../../lib/util'

type Tab = 'summary' | 'replies' | 'ask'

const TABS: Array<{ id: Tab; label: string; emoji: string }> = [
  { id: 'summary', label: 'Саммари', emoji: '📝' },
  { id: 'replies', label: 'Ответы', emoji: '⚡' },
  { id: 'ask', label: 'Спросить', emoji: '🔍' },
]

/**
 * ИИ-помощник по текущему чату.
 *
 * Всё считается на сервере (см. src/lib/assist.ts): здесь только три кнопки и
 * аккуратный вывод. Важное свойство: помощник ничего не отправляет сам —
 * вариант ответа уходит в чат только после явного нажатия.
 */
export function AiAssist({ onClose }: { onClose: () => void }) {
  const activeChatId = useStore((s) => s.activeChatId)
  const chats = useStore((s) => s.chats)
  const send = useStore((s) => s.send)
  const toast = useStore((s) => s.toast)
  const unreadMap = useStore((s) => s.unread)

  const chat = chats.find((c) => c.id === activeChatId) ?? null
  const [tab, setTab] = useState<Tab>('summary')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState('')
  const [replies, setReplies] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(fn: () => Promise<void>) {
    if (!activeChatId) return
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }

  const doSummary = () =>
    run(async () => {
      const res = await summariseUnread(activeChatId!)
      setSummary(res.text)
    })

  const doReplies = () =>
    run(async () => {
      setReplies(await suggestReplies(activeChatId!))
    })

  const doAsk = () =>
    run(async () => {
      if (!question.trim()) return
      setAnswer(await askAboutChat(activeChatId!, question.trim()))
    })

  // Первый запрос делается сам: панель открывают ради ответа, а не ради кнопки.
  useEffect(() => {
    if (!activeChatId) return
    if (tab === 'summary' && !summary && !busy) void doSummary()
    if (tab === 'replies' && replies.length === 0 && !busy) void doReplies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeChatId])

  async function useReply(text: string) {
    await send({ text })
    toast('Отправлено', '⚡')
    onClose()
  }

  const unread = activeChatId ? unreadMap[activeChatId] ?? 0 : 0

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="animate-slide-up flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-lg accent-gradient">✨</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">ИИ-помощник</div>
            <div className="truncate text-xs text-[var(--muted)]">{chat ? chat.title : 'Откройте чат'}</div>
          </div>
          <button onClick={onClose} className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]" aria-label="Закрыть">
            <X size={15} />
          </button>
        </div>

        <div className="flex gap-1 px-3 pt-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={classNames(
                'flex-1 rounded-xl px-3 py-2 text-xs font-medium transition',
                tab === t.id ? 'bg-[var(--panel-2)] text-[var(--text)]' : 'text-[var(--muted)] hover:bg-[var(--panel-hover)]',
              )}
            >
              <span className="mr-1">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="fancy-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {!activeChatId && <p className="text-sm text-[var(--muted)]">Сначала откройте любой чат — помощник работает по его переписке.</p>}

          {activeChatId && tab === 'summary' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted)]">
                {unread > 0 ? `Непрочитанных в этом чате: ${unread}` : 'Непрочитанного нет — перескажу конец переписки'}
              </p>
              {busy && !summary && <Skeleton />}
              {summary && <div className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</div>}
              <button onClick={doSummary} disabled={busy} className="btn-ghost w-full rounded-xl py-2 text-xs disabled:opacity-50">
                {busy ? 'Читаю…' : 'Пересчитать'}
              </button>
            </div>
          )}

          {activeChatId && tab === 'replies' && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--muted)]">Нажмите на вариант — он уйдёт в чат как обычное сообщение.</p>
              {busy && replies.length === 0 && <Skeleton />}
              {replies.map((r, i) => (
                <button
                  key={i}
                  onClick={() => void useReply(r)}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-left text-sm transition hover:border-[var(--accent)]"
                >
                  {r}
                </button>
              ))}
              <button onClick={doReplies} disabled={busy} className="btn-ghost w-full rounded-xl py-2 text-xs disabled:opacity-50">
                {busy ? 'Думаю…' : 'Другие варианты'}
              </button>
            </div>
          )}

          {activeChatId && tab === 'ask' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted)]">Например: «о чём договорились?», «кто что обещал?», «когда встреча?»</p>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void doAsk()
                  }}
                  placeholder="Вопрос по переписке"
                />
                <button onClick={doAsk} disabled={busy || !question.trim()} className="btn-primary rounded-xl px-4 text-sm disabled:opacity-50">
                  →
                </button>
              </div>
              {busy && <Skeleton />}
              {answer && <div className="whitespace-pre-wrap rounded-2xl bg-[var(--panel-2)] p-3 text-sm leading-relaxed">{answer}</div>}
            </div>
          )}

          {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
        </div>

        <div className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          Помощник читает только этот чат и только по вашему запросу.
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-3 animate-pulse rounded-full bg-[var(--panel-hover)]" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  )
}
