import { useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { useStore } from '../../store/useStore'

/** Full-screen viewer for photos and GIFs, with a download button. */
export function Lightbox() {
  const lightbox = useStore((s) => s.lightbox)
  const setLightbox = useStore((s) => s.setLightbox)

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, setLightbox])

  if (!lightbox) return null

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4 animate-fade-in"
      style={{ background: 'rgba(8,5,12,0.85)', backdropFilter: 'blur(6px)' }}
      onMouseDown={() => setLightbox(null)}
    >
      <div className="absolute right-3 top-3 flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
        <a
          href={lightbox.url}
          download={lightbox.name ?? 'image'}
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
      <img
        src={lightbox.url}
        alt={lightbox.name ?? ''}
        className="max-h-[92vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl animate-pop-in"
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}
