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
  Верхняя плашка десктопной сборки. Системная рамка выключена
  (decorations: false), поэтому поведение окна живёт здесь: перетаскивание
  даёт data-tauri-drag-region, двойной клик — разворот.

  Нарочно скучная: значок, название, точка непрочитанного и кнопки окна.
  В браузере компонент не рисует ничего.
*/
export default function TitleBar() {
  const [desktop] = useState(isDesktopApp)
  const [maximized, setMaximized] = useState(false)
  const unread = useStore((s) => s.unread)
  const total = Object.values(unread).reduce((a, b) => a + b, 0)

  /*
    onWindowResized — асинхронная и возвращает Promise. Отдавать её из
    useEffect напрямую нельзя: React ждёт функцию очистки и падает при
    размонтировании, а StrictMode делает его сразу после монтирования.
  */
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
    <div className="fc-titlebar" data-tauri-drag-region onDoubleClick={() => void toggleMaximizeWindow()}>
      <img src={logoUrl} alt="" className="fc-titlebar__logo" draggable={false} />
      <span className="fc-titlebar__name" data-tauri-drag-region>
        FemboyChat
      </span>
      {total > 0 && <span className="fc-titlebar__dot" title={`Непрочитанных: ${total}`} />}
      <div className="fc-titlebar__spacer" data-tauri-drag-region />
      <div className="fc-titlebar__controls">
        <button className="fc-titlebar__btn" title="Свернуть" aria-label="Свернуть" onClick={() => void minimizeWindow()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="fc-titlebar__btn"
          title={maximized ? 'Вернуть как было' : 'Развернуть'}
          aria-label={maximized ? 'Вернуть как было' : 'Развернуть'}
          onClick={() => void toggleMaximizeWindow()}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
              <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
            </svg>
          )}
        </button>
        <button
          className="fc-titlebar__btn fc-titlebar__btn--close"
          title="Закрыть"
          aria-label="Закрыть"
          onClick={() => void closeWindow()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  )
}
