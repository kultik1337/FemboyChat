import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { REACTIONS } from '../../lib/stickers'
import { classNames } from '../../lib/util'

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
  useMenu.getState().open({ x: e.clientX, y: e.clientY, items, ...opts })
}

export function ContextMenu() {
  const data = useMenu((s) => s.data)
  const close = useMenu((s) => s.close)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0, ready: false })

  useLayoutEffect(() => {
    if (!data) {
      setPos((p) => ({ ...p, ready: false }))
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
    const onScroll = () => close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [data, close])

  if (!data) return null

  return (
    <div className="fixed inset-0 z-[70]" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close() }}>
      <div
        ref={ref}
        className="absolute min-w-[200px] max-w-[260px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-2xl animate-pop-in"
        style={{ left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden', boxShadow: 'var(--shadow)', transformOrigin: 'top left' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {data.reactions && (
          <div className="no-scrollbar mb-1 flex items-center gap-0.5 overflow-x-auto rounded-xl bg-[var(--panel-2)] px-1.5 py-1">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { data.reactions!.onPick(emoji); close() }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl transition hover:scale-125 hover:bg-[var(--panel-hover)]"
              >
                {emoji}
              </button>
            ))}
          </div>
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
  )
}
