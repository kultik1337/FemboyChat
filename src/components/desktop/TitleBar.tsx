import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import {
  closeWindow,
  isDesktopApp,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from '../../lib/desktop'
import logoUrl from '../../../icon.png'
import './titlebar.css'

/*
  Собственная верхняя плашка для десктопной сборки. Системная рамка
  выключена (decorations: false), поэтому всё поведение окна живёт здесь:
  перетаскивание даёт data-tauri-drag-region, двойной клик — разворот.

  В браузере компонент не рисует ничего.
*/
export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const unread = useStore((s) => s.unread)
  const total = Object.values(unread).reduce((a, b) => a + b, 0)

  useEffect(() => {
    if (!isDesktopApp()) return
    void isWindowMaximized().then(setMaximized)
    return onWindowResized(() => void isWindowMaximized().then(setMaximized))
  }, [])

  if (!isDesktopApp()) return null

  return (
    <div className="fc-titlebar" data-tauri-drag-region onDoubleClick={() => void toggleMaximizeWindow()}>
      <img src={logoUrl} alt="" className="fc-titlebar__logo" draggable={false} />
      <span className="fc-titlebar__name" data-tauri-drag-region>
        FemboyChat
      </span>
      <span className="fc-titlebar__sub" data-tauri-drag-region>
        для Windows
      </span>
      {total > 0 && <span className="fc-titlebar__badge">{total > 99 ? '99+' : total}</span>}
      <div className="fc-titlebar__spacer" data-tauri-drag-region />
      <div className="fc-titlebar__controls">
        <button className="fc-titlebar__btn" title="Свернуть" onClick={() => void minimizeWindow()}>
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <rect x="1" y="5" width="9" height="1.1" rx="0.55" fill="currentColor" />
          </svg>
        </button>
        <button
          className="fc-titlebar__btn"
          title={maximized ? 'Вернуть как было' : 'Развернуть'}
          onClick={() => void toggleMaximizeWindow()}
        >
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <rect x="1.2" y="3.2" width="6.6" height="6.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
              <path d="M3.6 3V2.4A1.4 1.4 0 0 1 5 1h3.6A1.4 1.4 0 0 1 10 2.4V6a1.4 1.4 0 0 1-1.4 1.4H8" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <rect x="1.2" y="1.2" width="8.6" height="8.6" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          )}
        </button>
        <button
          className="fc-titlebar__btn fc-titlebar__btn--close"
          title="Закрыть"
          onClick={() => void closeWindow()}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M1.6 1.6l7.8 7.8M9.4 1.6l-7.8 7.8" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
