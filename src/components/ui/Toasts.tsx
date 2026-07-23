import { useStore } from '../../store/useStore'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-sm font-medium shadow-lg animate-slide-up"
          style={{ boxShadow: 'var(--shadow)' }}
        >
          {t.emoji && <span>{t.emoji}</span>}
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  )
}
