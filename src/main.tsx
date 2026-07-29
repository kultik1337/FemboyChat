import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { loadEmojiFont } from './lib/emojiFont'

// Requested before mount so the emoji font is usually ready by first paint,
// but never awaited -- the app must not wait on a font.
loadEmojiFont()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
