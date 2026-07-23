import { useEffect, useRef, useState } from 'react'
import { Clock, CornerUpLeft, ListChecks, Send, Smile, Sticker, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { EmojiPicker } from '../ui/EmojiPicker'
import { STICKERS } from '../../lib/defaults'
import type { Message, Poll } from '../../types'
import type { Person } from './people'
import { classNames } from '../../lib/util'

const TTLS = [
  { label: 'Выкл', v: 0 },
  { label: '5 сек', v: 5 },
  { label: '30 сек', v: 30 },
  { label: '1 мин', v: 60 },
  { label: '5 мин', v: 300 },
]

export function Composer({
  chatId,
  replyTo,
  replySender,
  editing,
  onClearReply,
  onClearEdit,
}: {
  chatId: string
  replyTo: Message | null
  replySender: Person | null
  editing: Message | null
  onClearReply: () => void
  onClearEdit: () => void
}) {
  const send = useStore((s) => s.send)
  const edit = useStore((s) => s.edit)
  const typingPing = useStore((s) => s.typingPing)
  const enterToSend = useStore((s) => s.account!.settings.enterToSend)

  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [stickers, setStickers] = useState(false)
  const [ttl, setTtl] = useState(0)
  const [ttlOpen, setTtlOpen] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      setText(editing.text)
      ref.current?.focus()
    }
  }, [editing])

  useEffect(() => {
    setText('')
    onClearEdit()
    onClearReply()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  function autosize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }
  useEffect(autosize, [text])

  function submit() {
    const t = text.trim()
    if (!t) return
    if (editing) {
      edit(editing.id, t)
      onClearEdit()
    } else {
      send({ text: t, replyToId: replyTo?.id, ttl: ttl || undefined })
      onClearReply()
    }
    setText('')
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && enterToSend) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      onClearReply()
      onClearEdit()
    }
  }

  return (
    <div className="relative border-t border-[var(--border)] bg-[var(--panel)] px-3 py-2.5">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-[var(--panel-2)] px-3 py-2 text-sm">
          <CornerUpLeft size={16} className="text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[var(--accent)]">{editing ? 'Редактирование' : `Ответ · ${replySender?.name ?? ''}`}</div>
            <div className="truncate text-[var(--muted)]">{editing ? editing.text : replyTo?.sticker ?? replyTo?.text}</div>
          </div>
          <button onClick={() => { onClearReply(); onClearEdit(); setText('') }} className="grid h-7 w-7 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
            <X size={15} />
          </button>
        </div>
      )}

      {emoji && <EmojiPicker onPick={(e) => setText((t) => t + e)} onClose={() => setEmoji(false)} />}
      {stickers && (
        <div className="absolute bottom-16 left-2 z-30 grid w-72 grid-cols-6 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
          {STICKERS.map((s) => (
            <button key={s} onClick={() => { send({ text: '', sticker: s }); setStickers(false) }} className="grid h-10 w-10 place-items-center rounded-xl text-2xl hover:bg-[var(--panel-hover)]">{s}</button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <button onClick={() => { setEmoji((v) => !v); setStickers(false) }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]">
          <Smile size={21} />
        </button>
        <button onClick={() => { setStickers((v) => !v); setEmoji(false) }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]">
          <Sticker size={21} />
        </button>

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => { setText(e.target.value); typingPing(chatId) }}
          onKeyDown={onKey}
          rows={1}
          placeholder="Сообщение…"
          className="max-h-40 flex-1 resize-none rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />

        {/* extras */}
        <div className="relative">
          <button onClick={() => setTtlOpen((v) => !v)} className={classNames('grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]', ttl ? 'text-[var(--accent)]' : 'text-[var(--muted)]')} title="Исчезающее сообщение">
            <Clock size={20} />
          </button>
          {ttlOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setTtlOpen(false)} />
              <div className="absolute bottom-12 right-0 z-30 w-36 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
                {TTLS.map((o) => (
                  <button key={o.v} onClick={() => { setTtl(o.v); setTtlOpen(false) }} className={classNames('block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--panel-hover)]', ttl === o.v && 'font-bold accent-text')}>{o.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <button onClick={() => setPollOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]" title="Опрос">
          <ListChecks size={20} />
        </button>

        <button onClick={submit} className="grid h-11 w-11 shrink-0 place-items-center rounded-full accent-gradient text-white shadow-md transition hover:brightness-105 active:scale-95">
          <Send size={19} />
        </button>
      </div>

      {pollOpen && <PollCreator onClose={() => setPollOpen(false)} onCreate={(p) => { send({ text: '', poll: p }); setPollOpen(false) }} />}
    </div>
  )
}

function PollCreator({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Poll) => void }) {
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const [multi, setMulti] = useState(false)
  const valid = q.trim() && opts.filter((o) => o.trim()).length >= 2
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(10,6,14,0.45)' }} onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-2xl animate-pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold">📊 Новый опрос</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Вопрос" className="input mb-2" />
        <div className="space-y-2">
          {opts.map((o, i) => (
            <input key={i} value={o} onChange={(e) => setOpts((a) => a.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Вариант ${i + 1}`} className="input" />
          ))}
        </div>
        <button onClick={() => setOpts((a) => [...a, ''])} className="mt-2 text-sm font-semibold accent-text">＋ Добавить вариант</button>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Несколько вариантов</label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Отмена</button>
          <button disabled={!valid} onClick={() => onCreate({ question: q.trim(), options: opts.filter((o) => o.trim()).map((t) => ({ text: t.trim(), uids: [] })), multi })} className="btn-primary disabled:opacity-50">Создать</button>
        </div>
      </div>
    </div>
  )
}
