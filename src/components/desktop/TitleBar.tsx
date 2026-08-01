import { useEffect, useState } from 'react'
import './titlebar.css'
import {
  closeWindow,
  isDesktopApp,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from '../../lib/desktop'

/**
 * Шапка окна десктопного приложения.
 *
 * В браузере компонент не рисует ничего и не трогает вёрстку — тот же
 * самый бандл ездит и на сайт, и в приложение.
 *
 * `data-tauri-drag-region` — это то, что делает полоску перетаскиваемой:
 * оболочка сама ловит нажатие на таком элементе и тащит окно, а двойной
 * клик разворачивает его на весь экран. На кнопках атрибута нет, иначе
 * они перестанут нажиматься.
 */
export default function TitleBar() {
  const [desktop] = useState(isDesktopApp)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!desktop) return
    let alive = true
    let off: () => void = () => {}

    const sync = () => {
      isWindowMaximized().then((v) => {
        if (alive) setMaximized(v)
      })
    }

    sync()
    onWindowResized(sync).then((unlisten) => {
      if (alive) off = unlisten
      else unlisten()
    })

    return () => {
      alive = false
      off()
    }
  }, [desktop])

  if (!desktop) return null

  return (
    <div className="fc-titlebar" data-tauri-drag-region onDoubleClick={toggleMaximizeWindow}>
      <div className="fc-titlebar__mark emoji" data-tauri-drag-region>
        ✦
      </div>
      <div className="fc-titlebar__name accent-text" data-tauri-drag-region>
        FemboyChat
      </div>
      <div className="fc-titlebar__sub" data-tauri-drag-region>
        для Windows
      </div>

      <div className="fc-titlebar__drag" data-tauri-drag-region />

      <div className="fc-titlebar__controls">
        <button className="fc-titlebar__btn" onClick={minimizeWindow} title="Свернуть" aria-label="Свернуть">
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <rect x="1" y="5" width="9" height="1.2" rx="0.6" fill="currentColor" />
          </svg>
        </button>

        <button
          className="fc-titlebar__btn"
          onClick={toggleMaximizeWindow}
          title={maximized ? 'Вернуть как было' : 'Развернуть'}
          aria-label={maximized ? 'Вернуть как было' : 'Развернуть'}
        >
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <rect x="1" y="3" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M3.4 3V2.4A1.4 1.4 0 0 1 4.8 1h3.8A1.4 1.4 0 0 1 10 2.4v3.8A1.4 1.4 0 0 1 8.6 7.6H8" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <rect x="1.2" y="1.2" width="8.6" height="8.6" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>

        <button
          className="fc-titlebar__btn fc-titlebar__btn--close"
          onClick={closeWindow}
          title="Закрыть"
          aria-label="Закрыть"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M1.6 1.6l7.8 7.8M9.4 1.6l-7.8 7.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
