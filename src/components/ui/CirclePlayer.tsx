import { useEffect, useRef, useState } from 'react'
import { Play, Volume2, VolumeX } from 'lucide-react'
import type { Attachment } from '../../types'
import { classNames } from '../../lib/util'

/**
 * Проигрыватель кружка.
 *
 * Отличается от обычного видео не только формой. У кружка нет полосы перемотки
 * и кнопки «на весь экран»: это реплика в разговоре, её слушают целиком, а не
 * отматывают к нужной секунде. Всё управление — тап по самому кружку, плюс
 * маленькая кнопка звука, потому что первое воспроизведение почти везде
 * начинается без него.
 *
 * Прогресс идёт кольцом по краю — единственное место, где он не отнимает
 * площадь у картинки.
 */

const RING = 2 * Math.PI * 48.5

export function CirclePlayer({ a, size = 200 }: { a: Attachment; size?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [left, setLeft] = useState(a.durationSec ?? 0)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onTime = () => {
      if (!el.duration || !isFinite(el.duration)) return
      setProgress(el.currentTime / el.duration)
      setLeft(Math.max(0, Math.ceil(el.duration - el.currentTime)))
    }
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
      el.currentTime = 0
      setLeft(a.durationSec ?? Math.round(el.duration || 0))
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onMeta = () => {
      if (el.duration && isFinite(el.duration)) setLeft(Math.round(el.duration))
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('ended', onEnd)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [a.durationSec])

  function toggle() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      // Первый тап всегда включает звук: беззвучный кружок — это гифка, а
      // человек записывал его, чтобы его услышали. Автозапуска здесь нет,
      // поэтому политика автовоспроизведения браузера не мешает.
      setMuted(false)
      el.muted = false
      void el.play().catch(() => {
        // Отказали в звуке — лучше показать без него, чем не показать вовсе.
        setMuted(true)
        el.muted = true
        void el.play().catch(() => undefined)
      })
    } else {
      el.pause()
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <video
        ref={videoRef}
        src={a.url}
        poster={a.poster}
        preload="metadata"
        playsInline
        muted={muted}
        onClick={toggle}
        className="h-full w-full cursor-pointer rounded-full bg-black object-cover shadow-md"
      />

      <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <circle
          cx="50"
          cy="50"
          r="48.5"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${progress * RING} ${RING}`}
        />
      </svg>

      {!playing && (
        <button
          onClick={toggle}
          className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-[2px] transition hover:scale-105 active:scale-95"
          title="Смотреть"
        >
          <Play size={22} fill="currentColor" className="ml-0.5" />
        </button>
      )}

      {/* Оставшееся время — как на голосовом, чтобы было видно, во что ввязываешься. */}
      <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur-[2px]">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>

      {playing && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            const el = videoRef.current
            if (!el) return
            el.muted = !el.muted
            setMuted(el.muted)
          }}
          className={classNames(
            'absolute right-0 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-[2px] transition hover:bg-black/70',
          )}
          title="Звук"
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      )}
    </div>
  )
}
