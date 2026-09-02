import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Crop, Droplets, Pencil, RotateCw, Undo2, X } from 'lucide-react'
import { classNames } from '../../lib/util'

/**
 * Редактор картинки перед отправкой: обрезать, повернуть, нарисовать, замазать.
 *
 * Работает целиком на клиенте и ничего никуда не отправляет — на выходе просто
 * новый Blob, который дальше идёт обычным путём загрузки вложения. Поэтому он
 * одинаково живой и в демо-режиме, и с Supabase.
 *
 * Устройство: есть один рабочий холст `baseRef` — это и есть текущая картинка.
 * Каждый инструмент меняет именно его, а видимый холст на каждом кадре просто
 * перерисовывает базу и поверх — обвязку инструмента (рамку обрезки, курсор
 * кисти). Из-за этого нет ни слоёв, ни порядка их применения: «замазать» после
 * «нарисовать» даёт ровно то, что человек видит на экране.
 *
 * Отмена хранит снимки холста целиком, а не список операций. Для десятка шагов
 * это дешевле и, главное, не может разойтись с картинкой: снимок — это и есть
 * картинка, а воспроизведение списка операций рано или поздно где-нибудь
 * ошибётся на пиксель.
 */

/** Дальше этого рабочий холст не растёт: редактор должен оставаться отзывчивым. */
const MAX_SIDE = 2000

/** Сколько шагов назад помнит «отменить». Каждый шаг — целый кадр в памяти. */
const HISTORY_LIMIT = 12

/** Во сколько раз уменьшается кусок под кистью «замазать» перед возвратом. */
const PIXELATE = 14

/** Палитра карандаша. Розовый первый — он же акцент приложения. */
const COLORS = ['#ff5da2', '#ffffff', '#111111', '#ffd166', '#4ade80', '#38bdf8']

type Tool = 'crop' | 'pen' | 'blur'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function ImageEditor({
  file,
  onCancel,
  onDone,
}: {
  file: File
  onCancel: () => void
  onDone: (blob: Blob) => void
}) {
  const viewRef = useRef<HTMLCanvasElement | null>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const historyRef = useRef<HTMLCanvasElement[]>([])
  const drawingRef = useRef(false)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null)
  const cropDragRef = useRef<{ mode: 'new' | 'move' | number; startX: number; startY: number; origin: Rect } | null>(null)

  const [ready, setReady] = useState(false)
  const [tool, setTool] = useState<Tool>('crop')
  const [color, setColor] = useState(COLORS[0])
  const [brush, setBrush] = useState(14)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  /** Перерисовать видимый холст: база плюс обвязка активного инструмента. */
  const paint = useCallback(() => {
    const view = viewRef.current
    const base = baseRef.current
    if (!view || !base) return
    if (view.width !== base.width || view.height !== base.height) {
      view.width = base.width
      view.height = base.height
    }
    const ctx = view.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, view.width, view.height)
    ctx.drawImage(base, 0, 0)

    if (tool !== 'crop' || !crop) return

    // Затемняем всё, что уйдёт под нож, и обводим то, что останется.
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.rect(0, 0, view.width, view.height)
    ctx.rect(crop.x, crop.y, crop.w, crop.h)
    ctx.fill('evenodd')

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(2, view.width / 400)
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h)

    // Уголки рисуем крупно: на телефоне попасть пальцем в тонкую линию нельзя.
    const grip = Math.max(14, view.width / 45)
    ctx.fillStyle = '#ffffff'
    for (const [cx, cy] of corners(crop)) {
      ctx.fillRect(cx - grip / 2, cy - grip / 2, grip, grip)
    }
    ctx.restore()
  }, [tool, crop])

  // Загрузка исходника в рабочий холст.
  useEffect(() => {
    let alive = true
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      if (!alive) return
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const base = document.createElement('canvas')
      base.width = w
      base.height = h
      const ctx = base.getContext('2d')
      if (!ctx) {
        setFailed(true)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      baseRef.current = base
      setCrop({ x: 0, y: 0, w, h })
      setReady(true)
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      if (!alive) return
      // Экзотический формат, который умеет декодировать <img>, но не canvas,
      // или просто битый файл. Отправить его без правок всё ещё можно.
      setFailed(true)
      URL.revokeObjectURL(url)
    }
    img.src = url
    return () => {
      alive = false
      URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    if (ready) paint()
  }, [ready, paint])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel])

  /** Снимок текущей базы — кладётся в историю перед каждой правкой. */
  function pushHistory() {
    const base = baseRef.current
    if (!base) return
    const snap = document.createElement('canvas')
    snap.width = base.width
    snap.height = base.height
    snap.getContext('2d')?.drawImage(base, 0, 0)
    historyRef.current.push(snap)
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
    setCanUndo(true)
  }

  function undo() {
    const snap = historyRef.current.pop()
    if (!snap) return
    baseRef.current = snap
    setCanUndo(historyRef.current.length > 0)
    // Рамка обрезки живёт в координатах картинки, а снимок мог быть другого
    // размера — после отмены она всегда сбрасывается на весь кадр.
    setCrop({ x: 0, y: 0, w: snap.width, h: snap.height })
    paint()
  }

  function rotate() {
    const base = baseRef.current
    if (!base) return
    pushHistory()
    const out = document.createElement('canvas')
    out.width = base.height
    out.height = base.width
    const ctx = out.getContext('2d')
    if (!ctx) return
    ctx.translate(out.width / 2, out.height / 2)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(base, -base.width / 2, -base.height / 2)
    baseRef.current = out
    setCrop({ x: 0, y: 0, w: out.width, h: out.height })
    paint()
  }

  function applyCrop() {
    const base = baseRef.current
    if (!base || !crop) return
    const r = normalize(crop, base.width, base.height)
    if (r.w < 8 || r.h < 8) return
    if (r.w === base.width && r.h === base.height) return
    pushHistory()
    const out = document.createElement('canvas')
    out.width = r.w
    out.height = r.h
    out.getContext('2d')?.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
    baseRef.current = out
    setCrop({ x: 0, y: 0, w: out.width, h: out.height })
    paint()
  }

  /** Экранная точка → координаты внутри картинки. */
  function toCanvas(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const view = viewRef.current!
    const rect = view.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * view.width,
      y: ((e.clientY - rect.top) / rect.height) * view.height,
    }
  }

  /** Замазать: кусок под кистью уменьшается и возвращается без сглаживания. */
  function pixelateAt(x: number, y: number) {
    const base = baseRef.current
    if (!base) return
    const ctx = base.getContext('2d')
    if (!ctx) return
    const r = brush * 1.6
    const sx = Math.max(0, Math.round(x - r))
    const sy = Math.max(0, Math.round(y - r))
    const sw = Math.min(base.width - sx, Math.round(r * 2))
    const sh = Math.min(base.height - sy, Math.round(r * 2))
    if (sw <= 0 || sh <= 0) return

    const small = document.createElement('canvas')
    small.width = Math.max(1, Math.round(sw / PIXELATE))
    small.height = Math.max(1, Math.round(sh / PIXELATE))
    const sctx = small.getContext('2d')
    if (!sctx) return
    sctx.drawImage(base, sx, sy, sw, sh, 0, 0, small.width, small.height)

    ctx.save()
    // Круглая кисть: без отсечения квадратные мазки видно на любой картинке.
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(small, 0, 0, small.width, small.height, sx, sy, sw, sh)
    ctx.restore()
  }

  function strokeTo(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = baseRef.current?.getContext('2d')
    if (!ctx) return
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = brush
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.restore()
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toCanvas(e)

    if (tool === 'crop') {
      const base = baseRef.current!
      const current = crop ?? { x: 0, y: 0, w: base.width, h: base.height }
      const grip = Math.max(18, base.width / 40)
      const hit = corners(current).findIndex(([cx, cy]) => Math.abs(cx - p.x) < grip && Math.abs(cy - p.y) < grip)
      const inside = p.x > current.x && p.x < current.x + current.w && p.y > current.y && p.y < current.y + current.h
      /*
        Рамка во весь кадр — это не выделение, а его отсутствие: так редактор
        открывается, и ничего ещё не выбрано. Тащить её всё равно некуда
        (сдвиг упирается в границы с обеих сторон), поэтому внутри такой рамки
        перетаскивание рисует новую. Как только выделен кусок поменьше, тот же
        жест снова его двигает.
      */
      const whole = current.w * current.h > base.width * base.height * 0.95
      const mode: 'new' | 'move' | number = hit >= 0 ? hit : inside && !whole ? 'move' : 'new'
      cropDragRef.current = { mode, startX: p.x, startY: p.y, origin: current }
      if (mode === 'new') setCrop({ x: p.x, y: p.y, w: 0, h: 0 })
      return
    }

    pushHistory()
    drawingRef.current = true
    lastPtRef.current = p
    if (tool === 'blur') pixelateAt(p.x, p.y)
    else strokeTo(p, p)
    paint()
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return
    const p = toCanvas(e)

    if (tool === 'crop') {
      const drag = cropDragRef.current
      const base = baseRef.current
      if (!drag || !base) return
      const dx = p.x - drag.startX
      const dy = p.y - drag.startY
      if (drag.mode === 'new') {
        setCrop(normalize({ x: drag.startX, y: drag.startY, w: dx, h: dy }, base.width, base.height))
      } else if (drag.mode === 'move') {
        const o = drag.origin
        setCrop({
          x: clamp(o.x + dx, 0, base.width - o.w),
          y: clamp(o.y + dy, 0, base.height - o.h),
          w: o.w,
          h: o.h,
        })
      } else {
        setCrop(resizeCorner(drag.origin, drag.mode, p, base.width, base.height))
      }
      return
    }

    if (!drawingRef.current) return
    const last = lastPtRef.current ?? p
    if (tool === 'blur') {
      // Ведём кистью по отрезку, а не ставим точку: при быстром движении между
      // событиями pointermove остаются нетронутые пропуски.
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / (brush * 0.7)))
      for (let i = 1; i <= steps; i++) {
        pixelateAt(last.x + ((p.x - last.x) * i) / steps, last.y + ((p.y - last.y) * i) / steps)
      }
    } else {
      strokeTo(last, p)
    }
    lastPtRef.current = p
    paint()
  }

  function onPointerUp() {
    drawingRef.current = false
    lastPtRef.current = null
    cropDragRef.current = null
  }

  async function finish() {
    const base = baseRef.current
    if (!base) return
    setBusy(true)
    try {
      // Обрезка применяется автоматически: рамка на экране — это обещание, и
      // требовать отдельного нажатия «применить» перед отправкой значит его
      // нарушить.
      applyCrop()
      const out = baseRef.current!
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/jpeg', 0.9))
      if (!blob) {
        setBusy(false)
        return
      }
      onDone(blob)
    } catch {
      setBusy(false)
    }
  }

  if (failed) {
    return (
      <Shell onCancel={onCancel}>
        <div className="grid flex-1 place-items-center px-6 text-center text-sm text-white/70">
          Не получилось открыть эту картинку для правки — но отправить как есть можно 🎀
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      onCancel={onCancel}
      onUndo={canUndo ? undo : undefined}
      onDone={ready && !busy ? finish : undefined}
      busy={busy}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-2">
        <canvas
          ref={viewRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={classNames(
            'max-h-full max-w-full touch-none rounded-xl shadow-2xl',
            tool === 'crop' ? 'cursor-crosshair' : 'cursor-none',
          )}
        />
      </div>

      <div className="shrink-0 space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
        {tool !== 'crop' && (
          <div className="flex items-center justify-center gap-3">
            {tool === 'pen' && (
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{ background: c }}
                    className={classNames(
                      'h-7 w-7 rounded-full border-2 transition',
                      color === c ? 'scale-110 border-white' : 'border-white/30',
                    )}
                    title="Цвет"
                  />
                ))}
              </div>
            )}
            <input
              type="range"
              min={4}
              max={48}
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value))}
              className="h-1 w-32 accent-[var(--accent)]"
              title="Толщина"
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5">
          <ToolButton active={tool === 'crop'} onClick={() => setTool('crop')} icon={<Crop size={18} />} label="Обрезать" />
          <ToolButton active={false} onClick={rotate} icon={<RotateCw size={18} />} label="Повернуть" />
          <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')} icon={<Pencil size={18} />} label="Рисовать" />
          <ToolButton active={tool === 'blur'} onClick={() => setTool('blur')} icon={<Droplets size={18} />} label="Замазать" />
        </div>
      </div>
    </Shell>
  )
}

/** Общая рамка редактора: шапка с отменой/готово и место под содержимое. */
function Shell({
  children,
  onCancel,
  onUndo,
  onDone,
  busy,
}: {
  children: React.ReactNode
  onCancel: () => void
  onUndo?: () => void
  onDone?: () => void
  busy?: boolean
}) {
  /*
    Портал в <body> обязателен, а не «для чистоты».

    Экран чата — это <main> с `will-change: transform` из motion.css. Такое
    свойство создаёт содержащий блок для `position: fixed`, и слой, отрисованный
    изнутри композера, растягивался не на окно, а на колонку переписки: слева
    оставался живой и кликабельный список чатов. Просмотрщик картинок этой
    беды не знает только потому, что живёт в корне приложения.
  */
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-[rgba(8,5,12,0.95)] animate-fade-in" style={{ backdropFilter: 'blur(6px)' }}>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          onClick={onCancel}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          title="Отмена"
        >
          <X size={20} />
        </button>
        <span className="text-sm font-bold text-white/80">Редактор</span>
        <div className="ml-auto flex items-center gap-2">
          {onUndo && (
            <button
              onClick={onUndo}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              title="Отменить (Ctrl+Z)"
            >
              <Undo2 size={19} />
            </button>
          )}
          <button
            onClick={onDone}
            disabled={!onDone || busy}
            className="grid h-10 w-10 place-items-center rounded-full accent-gradient text-white shadow-md transition hover:brightness-105 disabled:opacity-50"
            title="Готово"
          >
            <Check size={20} />
          </button>
        </div>
      </div>
      {children}
    </div>,
    document.body,
  )
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={classNames(
        'flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[10px] font-bold transition',
        active ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

// ────────────────────── геометрия рамки обрезки ──────────────────────

function corners(r: Rect): [number, number][] {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ]
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/** Привести прямоугольник к положительным сторонам и загнать внутрь картинки. */
function normalize(r: Rect, w: number, h: number): Rect {
  const x1 = clamp(Math.min(r.x, r.x + r.w), 0, w)
  const y1 = clamp(Math.min(r.y, r.y + r.h), 0, h)
  const x2 = clamp(Math.max(r.x, r.x + r.w), 0, w)
  const y2 = clamp(Math.max(r.y, r.y + r.h), 0, h)
  return { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) }
}

/** Тянем за один угол — противоположный стоит на месте. */
function resizeCorner(o: Rect, index: number, p: { x: number; y: number }, w: number, h: number): Rect {
  const left = o.x
  const top = o.y
  const right = o.x + o.w
  const bottom = o.y + o.h
  const box =
    index === 0
      ? { x: p.x, y: p.y, w: right - p.x, h: bottom - p.y }
      : index === 1
        ? { x: left, y: p.y, w: p.x - left, h: bottom - p.y }
        : index === 2
          ? { x: p.x, y: top, w: right - p.x, h: p.y - top }
          : { x: left, y: top, w: p.x - left, h: p.y - top }
  return normalize(box, w, h)
}
