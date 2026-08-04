import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import TitleBar from './components/desktop/TitleBar'
import { loadEmojiFont } from './lib/emojiFont'
import { initViewport } from './lib/viewport'
import { initTouchContextMenu } from './lib/longPress'
import { initSounds } from './lib/sound'
import { initDesktop } from './lib/desktop'
import { installSettingsGuard } from './lib/settingsGuard'

// Requested before mount so the emoji font is usually ready by first paint,
// but never awaited -- the app must not wait on a font.
loadEmojiFont()

// В десктопной оболочке освобождает место под свою шапку окна. До первой
// отрисовки — иначе интерфейс на мгновение дёргается вниз.
initDesktop()

// Must run before the first paint on phones: the app height depends on it.
initViewport()

// Turns a long press into the same context menu a right click opens.
initTouchContextMenu()

// Gives the chat its own send/receive sounds (synthesised, no audio files).
initSounds()

// Ни один аккаунт не попадёт в интерфейс с неполными настройками — иначе экран
// «Оформление» и приветствие падают при отрисовке (чёрный экран).
installSettingsGuard()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TitleBar />
    <App />
  </React.StrictMode>,
)
