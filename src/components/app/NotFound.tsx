// ─────────────────── 404 ───────────────────
//
// Битая ссылка — это почти всегда чужая ошибка: устаревший репост, обрезанный
// мессенджером адрес, опечатка в чате. Поэтому страница не ругается и не
// выглядит как системный сбой: она объясняет, что случилось, показывает сам
// адрес и даёт три очевидных выхода.
//
// И немного играет. Человек, попавший в тупик, обычно жмёт куда попало — пусть
// это хотя бы рассыпает бантики.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Logo } from '../ui/Logo'

/** Что рассыпается из-под курсора. */
const SPARKS = ['🎀', '💖', '✨', '🌸', '🦋', '💫', '🩷']
/** На каком по счёту бантике выдаётся пасхалка. */
const SECRET_AT = 7
/** Сколько секунд до автоматического возврата на главную. */
const RETURN_AFTER_SEC = 20
/** Сколько живёт одна искра, мс. Должно совпадать с длительностью анимации. */
const SPARK_LIFE_MS = 1100

type Spark = { id: number; x: number; y: number; emoji: string; drift: number; scale: number }

export function NotFound({ url }: { url: string }) {
  /** Наклон «404» за курсором: маленький, чтобы не укачивало. */
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [sparks, setSparks] = useState<Spark[]>([])
  const [caught, setCaught] = useState(0)
  const [copied, setCopied] = useState(false)
  const [left, setLeft] = useState(RETURN_AFTER_SEC)
  /*
    Обратный отсчёт замирает от любого осмысленного действия. Страница, которая
    уезжает домой прямо под читающим человеком, раздражает сильнее самой 404.
  */
  const [stay, setStay] = useState(false)
  const seq = useRef(0)
  const timers = useRef<number[]>([])

  const goHome = useCallback(() => {
    window.location.href = '/'
  }, [])

  /** Любое действие человека = «я тут разбираюсь, не увози меня». */
  const keepMe = useCallback(() => setStay(true), [])

  useEffect(() => {
    if (stay) return
    const timer = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.clearInterval(timer)
          goHome()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [stay, goHome])

  // Esc — общесистемный «выйти отсюда», грех не поддержать.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      keepMe()
      if (e.key === 'Escape') goHome()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keepMe, goHome])

  // Оставленные таймеры искр гасим на размонтировании, иначе setState
  // прилетит в уже мёртвый компонент.
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  function onPointerMove(e: React.PointerEvent) {
    const w = window.innerWidth || 1
    const h = window.innerHeight || 1
    setTilt({ x: (e.clientX / w - 0.5) * 16, y: (e.clientY / h - 0.5) * 12 })
  }

  function onPointerDown(e: React.PointerEvent) {
    keepMe()
    const id = ++seq.current
    const spark: Spark = {
      id,
      x: e.clientX,
      y: e.clientY,
      emoji: SPARKS[Math.floor(Math.random() * SPARKS.length)],
      drift: Math.round((Math.random() - 0.5) * 120),
      scale: 0.8 + Math.random() * 0.8,
    }
    setSparks((list) => [...list, spark])
    setCaught((n) => n + 1)
    navigator.vibrate?.(4)
    const t = window.setTimeout(() => {
      setSparks((list) => list.filter((s) => s.id !== id))
      timers.current = timers.current.filter((x) => x !== t)
    }, SPARK_LIFE_MS)
    timers.current.push(t)
  }

  async function copyUrl() {
    keepMe()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Буфер могут не дать — молча, ругаться тут не за что.
    }
  }

  const secret = caught >= SECRET_AT
  const progress = stay ? 0 : (left / RETURN_AFTER_SEC) * 100

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      className="fc-404 relative grid h-full place-items-center overflow-hidden px-5 text-center"
      style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}
    >
      <style>{`
        .fc-404 .blob { position: absolute; border-radius: 9999px; filter: blur(70px); opacity: .5; pointer-events: none; }
        .fc-404 .b1 { width: 380px; height: 380px; left: -90px; top: -70px; background: rgba(244,114,182,.35); animation: fc404-drift 15s ease-in-out infinite; }
        .fc-404 .b2 { width: 320px; height: 320px; right: -80px; bottom: -60px; background: rgba(103,232,249,.28); animation: fc404-drift 19s ease-in-out infinite reverse; }
        .fc-404 .b3 { width: 260px; height: 260px; right: 22%; top: 8%; background: rgba(167,139,250,.22); animation: fc404-drift 23s ease-in-out infinite; }
        @keyframes fc404-drift {
          0%, 100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(40px,-30px,0) scale(1.12); }
        }
        .fc-404 .digits { font-size: clamp(84px, 18vw, 190px); line-height: .95; font-weight: 900; letter-spacing: -.04em; }
        .fc-404 .grad {
          background: linear-gradient(100deg, #f9a8d4, #67e8f9, #c4b5fd, #f9a8d4);
          background-size: 300% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: fc404-shimmer 7s linear infinite;
        }
        @keyframes fc404-shimmer { to { background-position: 300% 0; } }
        .fc-404 .bow { display: inline-block; animation: fc404-breathe 3.2s ease-in-out infinite; }
        @keyframes fc404-breathe {
          0%, 100% { transform: rotate(-6deg) scale(1); }
          50% { transform: rotate(6deg) scale(1.08); }
        }
        .fc-404 .spark { position: fixed; pointer-events: none; font-size: 26px; animation: fc404-away ${SPARK_LIFE_MS}ms cubic-bezier(.2,.7,.3,1) forwards; }
        @keyframes fc404-away {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(.4) rotate(0deg); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -190%) scale(var(--sc)) rotate(150deg); }
        }
        .fc-404 .pop { animation: fc404-pop .5s cubic-bezier(.2,1.4,.4,1); }
        @keyframes fc404-pop { from { transform: scale(.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .fc-404 .blob, .fc-404 .grad, .fc-404 .bow, .fc-404 .spark, .fc-404 .pop { animation: none !important; }
        }
      `}</style>

      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />

      {sparks.map((s) => (
        <span
          key={s.id}
          className="spark"
          style={{ left: s.x, top: s.y, ['--dx' as string]: `${s.drift}px`, ['--sc' as string]: s.scale }}
        >
          {s.emoji}
        </span>
      ))}

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-5 py-10">
        <Logo size={52} className="animate-float !rounded-2xl" />

        <div
          className="digits select-none"
          style={{ transform: `perspective(700px) rotateY(${tilt.x}deg) rotateX(${-tilt.y}deg)`, transition: 'transform .18s ease-out' }}
        >
          <span className="grad">4</span>
          <span className="bow" aria-hidden>🎀</span>
          <span className="grad">4</span>
        </div>

        <h1 className="text-2xl font-extrabold text-[var(--text)] sm:text-3xl">Такой страницы тут нет</h1>
        <p className="max-w-md text-sm leading-relaxed text-[var(--muted)]">
          Ссылка могла устареть, потерять хвост при копировании или её просто никогда не было.
          С аккаунтом всё в порядке — потерялся только адрес.
        </p>

        <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
          <span className="truncate font-mono text-xs text-[var(--muted)]" title={url}>{url}</span>
          <button
            onClick={copyUrl}
            className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--panel-hover)]"
          >
            {copied ? 'скопировано ✓' : 'скопировать'}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            onClick={goHome}
            className="rounded-full bg-gradient-to-r from-pink-400 to-cyan-300 px-5 py-2.5 text-sm font-bold text-[#25131f] shadow-lg transition hover:brightness-110 active:scale-95"
          >
            На главную
          </button>
          <button
            onClick={() => { keepMe(); window.history.length > 1 ? window.history.back() : goHome() }}
            className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-5 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--panel-hover)] active:scale-95"
          >
            Назад
          </button>
        </div>

        <div className="text-xs text-[var(--muted)]">
          {stay ? (
            <span>Остаёмся здесь. <b className="text-[var(--text)]">Esc</b> — на главную.</span>
          ) : (
            <span>Вернём на главную через <b className="text-[var(--text)]">{left}</b> с — нажми куда угодно, чтобы остаться.</span>
          )}
        </div>

        {!stay && (
          <div className="h-0.5 w-40 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pink-400 to-cyan-300"
              style={{ width: `${progress}%`, transition: 'width 1s linear' }}
            />
          </div>
        )}

        {/* Счётчик появляется только когда человек уже начал тыкать: до этого
            он выглядел бы как непонятная деталь интерфейса. */}
        {caught > 0 && (
          <div key={secret ? 'secret' : 'count'} className="pop text-xs text-[var(--muted)]">
            {secret ? (
              <span>Поймано бантиков: <b className="text-[var(--text)]">{caught}</b> 🏆 Ладно, ты явно тут не случайно. Заходи в чат, там теплее.</span>
            ) : (
              <span>Поймано бантиков: <b className="text-[var(--text)]">{caught}</b></span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
