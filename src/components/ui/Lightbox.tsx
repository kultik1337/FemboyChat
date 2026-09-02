import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { classNames } from '../../lib/util'

/**
 * Полноэкранный просмотр медиа.
 *
 * Умеет две вещи сверх показа картинки: листать альбом, не закрываясь, и
 * проигрывать видео. Второе появилось вместе с альбомами — до них видео в
 * просмотрщик просто не попадало, у него свой плеер прямо в переписке, а
 * ячейка сетки слишком мала, чтобы смотреть в ней.
 *
 * Если альбома нет, всё ведёт себя ровно как раньше: одна картинка, стрелок
 * нет, свайпы ничего не делают.
 */

/** Насколько далеко надо провести пальцем, чтобы это считалось листанием. */
const SWIPE_PX = 48

export function Lightbox() {
  const lightbox = useStore((s) => s.lightbox)
  const setLightbox = useStore((s) => s.setLightbox)

  const items = lightbox?.album?.length ? lightbox.album : lightbox ? [{ url: lightbox.url, name: lightbox.name }] : []
  const [index, setIndex] = useState(0)
  const touchRef = useRef<{ x: number; y: number } | null>(null)

  // Открыли конкретную картинку — с неё и начинаем, даже если в альбоме она
  // третья. Сравнение по ссылке: другого устойчивого ключа у элемента нет.
  useEffect(() => {
    if (!lightbox) return
    const at = items.findIndex((i) => i.url === lightbox.url)
    setIndex(at >= 0 ? at : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox?.url, lightbox?.album])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(items.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, setLightbox, items.length])

  if (!lightbox) return null

  const current = items[index] ?? items[0]
  if (!current) return null

  const many = items.length > 1
  const isVideo = current.kind === 'video' || current.kind === 'circle'

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4 animate-fade-in"
      style={{ background: 'rgba(8,5,12,0.85)', backdropFilter: 'blur(6px)' }}
      onMouseDown={() => setLightbox(null)}
      onTouchStart={(e) => {
        const t = e.touches[0]
        touchRef.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={(e) => {
        const start = touchRef.current
        touchRef.current = null
        if (!start || !many) return
        const t = e.changedTouches[0]
        const dx = t.clientX - start.x
        // Вертикальный жест — это прокрутка или закрытие, а не листание.
        if (Math.abs(dx) < SWIPE_PX || Math.abs(t.clientY - start.y) > Math.abs(dx)) return
        setIndex((i) => (dx < 0 ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1)))
      }}
    >
      <div className="absolute right-3 top-3 flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
        <a
          href={current.url}
          download={current.name ?? 'media'}
          target="_blank"
          rel="noreferrer noopener"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          title="Скачать"
        >
          <Download size={19} />
        </a>
        <button
          onClick={() => setLightbox(null)}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          title="Закрыть"
        >
          <X size={20} />
        </button>
      </div>

      {many && (
        <div
          className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-bold tabular-nums text-white/90"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {index + 1} / {items.length}
        </div>
      )}

      {many && index > 0 && (
        <NavButton side="left" onClick={() => setIndex((i) => Math.max(0, i - 1))} />
      )}
      {many && index < items.length - 1 && (
        <NavButton side="right" onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))} />
      )}

      {isVideo ? (
        <video
          key={current.url}
          src={current.url}
          controls
          autoPlay
          playsInline
          className={classNames(
            'max-h-[92vh] max-w-[94vw] shadow-2xl',
            // Появление анимируем только на открытии: `key` меняется на каждом
            // шаге листания, и «выпрыгивание» на каждой картинке из плавного
            // жеста делает череду рывков.
            !many && 'animate-pop-in',
            current.kind === 'circle' ? 'rounded-full' : 'rounded-2xl',
          )}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          key={current.url}
          src={current.url}
          alt={current.name ?? ''}
          className={classNames('max-h-[92vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl', !many && 'animate-pop-in')}
          onMouseDown={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      className={classNames(
        'absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20',
        side === 'left' ? 'left-3' : 'right-3',
      )}
      title={side === 'left' ? 'Предыдущее' : 'Следующее'}
    >
      {side === 'left' ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
    </button>
  )
}
