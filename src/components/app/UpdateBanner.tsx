import { useEffect, useState } from 'react'
import { checkForUpdate, skipVersion, type UpdateInfo } from '../../lib/update'
import { APP_RELEASE } from '../../lib/version'

/**
 * Карточка «вышла новая версия» для десктопного приложения.
 *
 * Появляется не сразу, а через паузу после запуска: первые секунды человек
 * смотрит, кто ему написал, а не читает про сборки. И всегда закрывается: окно,
 * которое нельзя прогнать, раздражает сильнее, чем старая версия.
 *
 * Ссылка открывается обычным <a target="_blank"> — тем же способом, каким в
 * приложении открываются ссылки в сообщениях. Отдельного механизма здесь не
 * изобретаем.
 */

/** Пауза перед проверкой, чтобы не мешать загрузке чатов. */
const DELAY_MS = 4000

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      checkForUpdate().then((found) => {
        if (alive) setInfo(found)
      })
    }, DELAY_MS)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  if (!info || hidden) return null

  return (
    <div className="fixed bottom-5 right-5 z-[55] w-[320px] max-w-[calc(100vw-2.5rem)] animate-slide-up">
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4"
        style={{ boxShadow: 'var(--shadow)' }}
      >
        <div className="flex items-start gap-3">
          <span className="text-xl leading-none">✨</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Вышла версия {info.version}</div>
            <div className="mt-0.5 text-xs text-[var(--muted)]">У тебя сейчас {APP_RELEASE}</div>
          </div>
        </div>

        {info.notes && (
          <div className="mt-3 max-h-24 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-[var(--muted)]">
            {info.notes}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <a
            href={info.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => setHidden(true)}
            className="flex-1 rounded-xl bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-[var(--on-accent)]"
          >
            Скачать
          </a>
          <button
            onClick={() => setHidden(true)}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted)]"
          >
            Позже
          </button>
        </div>

        <button
          onClick={() => {
            skipVersion(info.version)
            setHidden(true)
          }}
          className="mt-2 w-full text-center text-[11px] text-[var(--muted)] hover:underline"
        >
          Пропустить эту версию
        </button>
      </div>
    </div>
  )
}
