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

/**
 * Умеет ли холст размывать сам.
 *
 * `ctx.filter` есть везде, кроме Safari старше 16.4. Проверяем присваиванием:
 * браузер, который свойство не поддерживает, оставит его пустым.
 */
const CANVAS_FILTER = (() => {
  try {
    const probe = document.createElement('canvas').getContext('2d')
    if (!probe) return false
    probe.filter = 'blur(2px)'
    return probe.filter === 'blur(2px)'
  } catch {
    return false
  }
})()

/** Меньше этого рамка обрезки считается случайным кликом, а не выделением. */
const MIN_CROP = 12

/** Пропорции рамки. `null` — свободная. */
const ASPECTS: { label: string; value: number | null }[] = [
  { label: 'Свободно', value: null },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '16:9', value: 16 / 9 },
]

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
  /** Выбранное соотношение сторон рамки; null — свободное. */
  const [aspect, setAspect] = useState<number | null>(null)
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

    const line = Math.max(1.5, view.width / 500)

    /*
      Сетка третей. Не украшение: она и есть причина, по которой кадр вообще
      двигают — линии показывают, куда встанет горизонт и на какой трети
      окажется лицо. Без неё рамка — просто прямоугольник, и понять, что
      именно ты выбираешь, можно только на глаз.
    */
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = line
    ctx.beginPath()
    for (let i = 1; i < 3; i++) {
      const x = crop.x + (crop.w * i) / 3
      const y = crop.y + (crop.h * i) / 3
      ctx.moveTo(x, crop.y)
      ctx.lineTo(x, crop.y + crop.h)
      ctx.moveTo(crop.x, y)
      ctx.lineTo(crop.x + crop.w, y)
    }
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = line
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h)

    // Ручки крупные: на телефоне попасть пальцем в тонкую линию невозможно.
    const grip = Math.max(14, view.width / 45)
    ctx.fillStyle = '#ffffff'
    for (const [hx, hy] of handlePoints(crop, aspect !== null)) {
      ctx.beginPath()
      ctx.arc(hx, hy, grip / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }, [tool, crop, aspect])

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
    /*
      Матрицу обязательно вернуть на место.

      `getContext('2d')` отдаёт один и тот же объект контекста на всю жизнь
      холста, а поворот и сдвиг остаются в нём после выхода из этой функции.
      Без сброса каждый следующий штрих карандаша и каждое пятно размытия
      ложились на повёрнутую систему координат: человек вёл мышь вверх, а
      линия шла вбок. Именно так и выглядела «инверсия после поворота».
    */
    ctx.setTransform(1, 0, 0, 1, 0, 0)
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

  /**
   * Размыть кусок под кистью.
   *
   * Пиксели здесь были плохой идеей: крупные квадраты выглядят как дефект
   * картинки, а не как намеренно скрытое место, и лицо под ними всё равно
   * угадывается по силуэту. Настоящее размытие мягче и честнее прячет.
   *
   * Область берётся с запасом по краям и только потом обрезается кругом кисти.
   * Без запаса размытие подтягивало бы прозрачность за границей вырезанного
   * куска и оставляло тёмный ободок по краю каждого мазка.
   */
  function blurAt(x: number, y: number) {
    const base = baseRef.current
    if (!base) return
    const ctx = base.getContext('2d')
    if (!ctx) return

    const r = brush * 1.6
    const strength = Math.max(4, r / 2)
    // Гауссу нужно примерно три радиуса, чтобы сойти на нет.
    const pad = Math.ceil(strength * 3)
    const sx = Math.max(0, Math.floor(x - r - pad))
    const sy = Math.max(0, Math.floor(y - r - pad))
    const sw = Math.min(base.width, Math.ceil(x + r + pad)) - sx
    const sh = Math.min(base.height, Math.ceil(y + r + pad)) - sy
    if (sw <= 0 || sh <= 0) return

    const tmp = document.createElement('canvas')
    tmp.width = sw
    tmp.height = sh
    const tctx = tmp.getContext('2d')
    if (!tctx) return

    if (CANVAS_FILTER) {
      tctx.filter = `blur(${strength}px)`
      tctx.drawImage(base, sx, sy, sw, sh, 0, 0, sw, sh)
    } else {
      // Запасной путь: уменьшить и вернуть обратно СО сглаживанием. Это не
      // Гаусс, но мягкая размытая каша, а не квадраты.
      const k = Math.max(2, Math.round(strength / 2))
      const small = document.createElement('canvas')
      small.width = Math.max(1, Math.round(sw / k))
      small.height = Math.max(1, Math.round(sh / k))
      const sctx = small.getContext('2d')
      if (!sctx) return
      sctx.drawImage(base, sx, sy, sw, sh, 0, 0, small.width, small.height)
      tctx.imageSmoothingEnabled = true
      tctx.imageSmoothingQuality = 'high'
      tctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, sw, sh)
    }

    ctx.save()
    // Круглая кисть: без отсечения квадратные мазки видно на любой картинке.
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(tmp, sx, sy)
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
      const hit = handlePoints(current, aspect !== null).findIndex(
        ([hx, hy]) => hx !== null && Math.abs(hx - p.x) < grip && Math.abs(hy - p.y) < grip,
      )
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
    if (tool === 'blur') blurAt(p.x, p.y)
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
        const free = normalize({ x: drag.startX, y: drag.startY, w: dx, h: dy }, base.width, base.height)
        setCrop(aspect ? fitAspect(free, aspect, drag.startX, drag.startY, base.width, base.height) : free)
      } else if (drag.mode === 'move') {
        const o = drag.origin
        setCrop({
          x: clamp(o.x + dx, 0, base.width - o.w),
          y: clamp(o.y + dy, 0, base.height - o.h),
          w: o.w,
          h: o.h,
        })
      } else {
        setCrop(resizeHandle(drag.origin, drag.mode, p, base.width, base.height, aspect))
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
        blurAt(last.x + ((p.x - last.x) * i) / steps, last.y + ((p.y - last.y) * i) / steps)
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

    /*
      Одиночный клик мимо рамки начинал новое выделение и заканчивал его там
      же — оставалась рамка нулевого размера, то есть весь кадр под затемнением
      и ни одного пикселя внутри. Выглядело это как «редактор почернел», и
      выйти из состояния можно было только отменой. Слишком мелкую рамку
      возвращаем к той, что была до жеста.
    */
    const drag = cropDragRef.current
    cropDragRef.current = null
    if (!drag || tool !== 'crop') return
    setCrop((r) => (r && (r.w < MIN_CROP || r.h < MIN_CROP) ? drag.origin : r))
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
        {tool === 'crop' && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {ASPECTS.map((a) => (
              <button
                key={a.label}
                onClick={() => {
                  setAspect(a.value)
                  const base = baseRef.current
                  if (!base) return
                  // Пропорция без немедленной подгонки рамки — это обещание,
                  // которое сбудется только после следующего жеста. Показываем
                  // результат сразу.
                  setCrop(a.value ? centeredAspect(a.value, base.width, base.height) : { x: 0, y: 0, w: base.width, h: base.height })
                }}
                className={classNames(
                  'rounded-full px-3 py-1 text-[11px] font-bold transition',
                  aspect === a.value ? 'bg-white text-[#1b1030]' : 'bg-white/10 text-white/70 hover:bg-white/20',
                )}
              >
                {a.label}
              </button>
            ))}
            <button
              onClick={() => {
                const base = baseRef.current
                if (!base) return
                setAspect(null)
                setCrop({ x: 0, y: 0, w: base.width, h: base.height })
              }}
              className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/70 transition hover:bg-white/20"
              title="Вернуть рамку на весь кадр"
            >
              Сбросить
            </button>
          </div>
        )}

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
          <ToolButton active={tool === 'blur'} onClick={() => setTool('blur')} icon={<Droplets size={18} />} label="Размыть" />
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

/**
 * Точки ручек рамки: четыре угла, затем четыре середины сторон.
 *
 * При заданной пропорции середины сторон не выдаются: потянув за них, размер
 * пришлось бы менять по обеим осям сразу, и рамка прыгала бы под пальцем.
 * Углы в этом режиме делают всё, что нужно.
 */
function handlePoints(r: Rect, cornersOnly: boolean): [number, number][] {
  const pts: [number, number][] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ]
  if (cornersOnly) return pts
  return [
    ...pts,
    [r.x + r.w / 2, r.y],
    [r.x + r.w, r.y + r.h / 2],
    [r.x + r.w / 2, r.y + r.h],
    [r.x, r.y + r.h / 2],
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

/**
 * Тянем за ручку: противоположный край стоит на месте.
 *
 * Индексы совпадают с `handlePoints`: 0-3 — углы по часовой стрелке от левого
 * верхнего, 4-7 — середины верхней, правой, нижней и левой сторон.
 */
function resizeHandle(
  o: Rect,
  index: number,
  p: { x: number; y: number },
  w: number,
  h: number,
  aspect: number | null,
): Rect {
  let left = o.x
  let top = o.y
  let right = o.x + o.w
  let bottom = o.y + o.h

  if (index === 0 || index === 3 || index === 7) left = p.x
  if (index === 1 || index === 2 || index === 5) right = p.x
  if (index === 0 || index === 1 || index === 4) top = p.y
  if (index === 2 || index === 3 || index === 6) bottom = p.y

  const free = normalize({ x: left, y: top, w: right - left, h: bottom - top }, w, h)
  if (!aspect) return free

  // Якорь — угол, противоположный тому, за который тянут.
  const anchorX = index === 0 || index === 3 ? o.x + o.w : o.x
  const anchorY = index === 0 || index === 1 ? o.y + o.h : o.y
  return fitAspect(free, aspect, anchorX, anchorY, w, h)
}

/**
 * Подогнать рамку под соотношение сторон, удерживая на месте точку `ax, ay`.
 *
 * Рамка только уменьшается относительно свободной: так она никогда не вылезет
 * ни за картинку, ни за то место, которое человек обвёл.
 */
function fitAspect(free: Rect, aspect: number, ax: number, ay: number, imgW: number, imgH: number): Rect {
  const growRight = free.x + free.w / 2 >= ax
  const growDown = free.y + free.h / 2 >= ay
  const maxW = growRight ? imgW - ax : ax
  const maxH = growDown ? imgH - ay : ay

  let width = Math.min(Math.max(free.w, 1), Math.max(maxW, 1))
  let height = Math.min(Math.max(free.h, 1), Math.max(maxH, 1))
  if (width / height > aspect) width = height * aspect
  else height = width / aspect
  if (width > maxW) {
    width = maxW
    height = width / aspect
  }
  if (height > maxH) {
    height = maxH
    width = height * aspect
  }

  return {
    x: Math.round(growRight ? ax : ax - width),
    y: Math.round(growDown ? ay : ay - height),
    w: Math.round(width),
    h: Math.round(height),
  }
}

/** Наибольшая рамка заданной пропорции по центру картинки. */
function centeredAspect(aspect: number, imgW: number, imgH: number): Rect {
  let w = imgW
  let h = w / aspect
  if (h > imgH) {
    h = imgH
    w = h * aspect
  }
  return { x: Math.round((imgW - w) / 2), y: Math.round((imgH - h) / 2), w: Math.round(w), h: Math.round(h) }
}
