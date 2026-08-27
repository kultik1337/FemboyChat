import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { Plus } from 'lucide-react'
import { REACTIONS } from '../../lib/stickers'
import { EmojiGrid } from './EmojiPicker'
import { classNames } from '../../lib/util'
import { ReportHost } from './ReportDialog'

export interface MenuAction {
  kind?: 'action'
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  checked?: boolean
}
export interface MenuDivider {
  kind: 'divider'
}
export type MenuItem = MenuAction | MenuDivider

/**
 * Порядок пунктов в любом меню.
 *
 * Меню собираются из кусков: меню участника — это personMenu() плюс
 * админские пункты сверху. Из-за этого красное «Остановить бота» оказывалось
 * посередине, а за ним шло обычное «Назначить админом» и снова красное
 * «Удалить из группы». Собирать опасные действия вручную в каждом месте
 * сборки — значит рано или поздно где-то забыть, поэтому нормализация
 * живёт в единственной точке входа — openContextMenu().
 *
 * Правило: сначала обычные действия в исходном порядке, потом один
 * разделитель, потом все красные пункты. Набор пунктов не меняется.
 */
export function normalizeMenu(items: MenuItem[]): MenuItem[] {
  const safe: MenuItem[] = []
  const danger: MenuItem[] = []
  for (const it of items) {
    if (it.kind === 'divider') {
      safe.push(it)
      continue
    }
    if (it.danger) danger.push(it)
    else safe.push(it)
  }
  const out = collapseDividers(safe)
  if (danger.length) {
    if (out.length) out.push({ kind: 'divider' })
    out.push(...danger)
  }
  return out
}

/** Убрать сдвоенные, ведущие и висячие разделители. */
function collapseDividers(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = []
  for (const it of items) {
    if (it.kind === 'divider' && (out.length === 0 || out[out.length - 1].kind === 'divider')) continue
    out.push(it)
  }
  while (out.length && out[out.length - 1].kind === 'divider') out.pop()
  return out
}

interface MenuData {
  x: number
  y: number
  items: MenuItem[]
  reactions?: { onPick: (emoji: string) => void }
  header?: string
}

interface MenuStore {
  data: MenuData | null
  open: (d: MenuData) => void
  close: () => void
}

export const useMenu = create<MenuStore>((set) => ({
  data: null,
  open: (data) => set({ data }),
  close: () => set({ data: null }),
}))

/** Open a floating context menu at the cursor. Prevents the native menu. */
export function openContextMenu(
  e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number },
  items: MenuItem[],
  opts?: { reactions?: { onPick: (emoji: string) => void }; header?: string },
) {
  e.preventDefault()
  e.stopPropagation()
  useMenu.getState().open({ x: e.clientX, y: e.clientY, items: normalizeMenu(items), ...opts })
}

export function ContextMenu() {
  const data = useMenu((s) => s.data)
  const close = useMenu((s) => s.close)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0, ready: false })
  const [allEmoji, setAllEmoji] = useState(false)

  useLayoutEffect(() => {
    if (!data) {
      setPos((p) => ({ ...p, ready: false }))
      setAllEmoji(false)
      return
    }
    const el = ref.current
    const pad = 8
    const w = el?.offsetWidth ?? 224
    const h = el?.offsetHeight ?? 200
    let x = data.x
    let y = data.y
    if (x + w + pad > window.innerWidth) x = window.innerWidth - w - pad
    if (y + h + pad > window.innerHeight) y = window.innerHeight - h - pad
    setPos({ x: Math.max(pad, x), y: Math.max(pad, y), ready: true })
  }, [data])

  useEffect(() => {
    if (!data) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    // Close when the page behind scrolls, but NOT when scrolling inside the
    // menu itself (e.g. the emoji strip or a long emoji grid).
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [data, close])

  /*
    Форма жалобы рендерится здесь и тогда, когда самого меню нет. Пункт
    «Пожаловаться» закрывает меню в тот же кадр, в котором открывает диалог,
    так что диалог внутри ветки «меню открыто» умирал бы мгновенно.
  */
  if (!data) return <ReportHost />

  return (
    <>
      <div className="fixed inset-0 z-[70]" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close() }}>
        <div
          ref={ref}
          className="absolute min-w-[200px] max-w-[280px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-2xl animate-pop-in"
          style={{ left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden', boxShadow: 'var(--shadow)', transformOrigin: 'top left' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {data.reactions && (
            <>
              <ReactionStrip
                onPick={(emoji) => { data.reactions!.onPick(emoji); close() }}
                allEmoji={allEmoji}
                onToggleAll={() => setAllEmoji((v) => !v)}
              />
              {allEmoji && (
                <div className="mb-1 rounded-xl bg-[var(--panel-2)] p-1.5">
                  <EmojiGrid compact onPick={(e) => { data.reactions!.onPick(e); close() }} />
                </div>
              )}
            </>
          )}
          {data.header && <div className="px-3 py-1.5 text-xs font-bold text-[var(--muted)]">{data.header}</div>}
          {data.items.map((it, i) =>
            it.kind === 'divider' ? (
              <div key={i} className="my-1 h-px bg-[var(--border)]" />
            ) : (
              <button
                key={i}
                onClick={() => { it.onClick(); close() }}
                className={classNames(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-[var(--panel-hover)]',
                  it.danger && 'text-rose-500',
                )}
              >
                {it.icon && <span className="grid w-4 place-items-center">{it.icon}</span>}
                <span className="flex-1 truncate">{it.label}</span>
                {it.checked && <span className="accent-text font-bold">✓</span>}
              </button>
            ),
          )}
        </div>
      </div>
      <ReportHost />
    </>
  )
}

/**
 * Horizontal reaction picker.
 *
 * The strip has always been scrollable, but only in ways a mouse cannot do: a
 * plain wheel produces vertical deltas, which a horizontal scroller ignores, so
 * every reaction past the visible ones was unreachable. The wheel listener is
 * registered by hand because React routes onWheel through a passive listener,
 * where preventDefault() is a no-op.
 */
function ReactionStrip({
  onPick,
  allEmoji,
  onToggleAll,
}: {
  onPick: (emoji: string) => void
  allEmoji: boolean
  onToggleAll: () => void
}) {
  const strip = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const syncEdges = useCallback(() => {
    const el = strip.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({ left: el.scrollLeft > 2, right: max > 2 && el.scrollLeft < max - 2 })
  }, [])

  useEffect(() => {
    const el = strip.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      const box = strip.current
      if (!box) return
      const max = box.scrollWidth - box.clientWidth
      if (max <= 0) return
      // Line/page deltas come in different units; only the sign matters here.
      const step = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) || 0
      if (!step) return
      const next = Math.min(max, Math.max(0, box.scrollLeft + Math.sign(step) * 60))
      if (next === box.scrollLeft) return
      // Keeps the page (and the message list) from scrolling underneath.
      e.preventDefault()
      box.scrollLeft = next
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    syncEdges()
    const ro = new ResizeObserver(syncEdges)
    ro.observe(el)
    return () => {
      el.removeEventListener('wheel', onWheel)
      ro.disconnect()
    }
  }, [syncEdges])

  return (
    <div className="relative mb-1 rounded-xl bg-[var(--panel-2)]">
      <div
        ref={strip}
        onScroll={syncEdges}
        className="no-scrollbar flex touch-pan-x items-center gap-0.5 overflow-x-auto overscroll-x-contain px-1.5 py-1"
      >
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onPick(emoji)}
            className="emoji grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl leading-none transition hover:scale-125 hover:bg-[var(--panel-hover)]"
          >
            {emoji}
          </button>
        ))}
        <button
          onClick={onToggleAll}
          className={classNames('grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-[var(--border)] text-[var(--muted)] transition hover:scale-110 hover:bg-[var(--panel-hover)]', allEmoji && 'rotate-45')}
          title="Все эмодзи"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Fading edges: the only hint that the strip continues, since the
          scrollbar is hidden here on purpose. */}
      {edges.left && (
        <span className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-xl" style={{ background: 'linear-gradient(90deg, var(--panel-2), transparent)' }} />
      )}
      {edges.right && (
        <span className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-xl" style={{ background: 'linear-gradient(270deg, var(--panel-2), transparent)' }} />
      )}
    </div>
  )
}
