import { useEffect } from 'react'
import { X } from 'lucide-react'
import { classNames } from '../../lib/util'

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  flush,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  wide?: boolean
  flush?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-stretch p-0 sm:place-items-center sm:p-4"
      style={{ background: 'rgba(10,6,14,0.45)', backdropFilter: 'blur(4px)' }}
      onMouseDown={onClose}
    >
      <div
        className={classNames(
          'flex w-full flex-col overflow-hidden bg-[var(--panel)] shadow-2xl animate-pop-in',
          'h-full rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:border sm:border-[var(--border)]',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        style={{ boxShadow: 'var(--shadow)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-lg font-bold">{title}</h3>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {flush ? (
          <div className="min-h-0 flex-1 sm:flex-none">{children}</div>
        ) : (
          <div className="fancy-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:flex-none sm:max-h-[75vh]">{children}</div>
        )}
      </div>
    </div>
  )
}
