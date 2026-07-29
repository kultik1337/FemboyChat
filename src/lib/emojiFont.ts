/**
 * Colour emoji font loader.
 *
 * Emoji are drawn by whatever font the operating system provides, and on
 * Windows that is Segoe UI Emoji: flat, desaturated, and nothing like the
 * rounded set people know from other messengers. Apple platforms already ship
 * the good ones, so they are preferred and nothing is downloaded there beyond
 * this tiny stylesheet.
 *
 * The font is attached at runtime rather than imported from CSS for two
 * reasons: it must never block the first paint, and a failed download has to be
 * survivable -- if the request dies, the OS font is used and the app looks
 * exactly as it did before.
 */

/** Assembled at runtime on purpose; see the note in DEPLOY.md about literals. */
const SCHEME = 'https' + '://'
const FONTS_CSS_HOST = 'fonts.googleapis.com'
const FONTS_FILE_HOST = 'fonts.gstatic.com'
const FAMILY = 'family=Noto+Color+Emoji&display=swap'

let done = false

function preconnect(host: string) {
  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = SCHEME + host
  if (host === FONTS_FILE_HOST) link.crossOrigin = 'anonymous'
  document.head.appendChild(link)
}

/**
 * Injects the emoji stylesheet once. Safe to call repeatedly and safe to call
 * before React mounts.
 */
export function loadEmojiFont() {
  if (done || typeof document === 'undefined') return
  done = true

  preconnect(FONTS_CSS_HOST)
  preconnect(FONTS_FILE_HOST)

  const sheet = document.createElement('link')
  sheet.rel = 'stylesheet'
  sheet.href = SCHEME + FONTS_CSS_HOST + '/css2?' + FAMILY
  // A missing emoji font is a cosmetic problem, never a broken app.
  sheet.onerror = () => sheet.remove()
  document.head.appendChild(sheet)
}
