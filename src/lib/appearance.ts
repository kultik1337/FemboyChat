import type { ThemeName, UserSettings } from '../types'

function shade(hex: string, amt: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  let r = (n >> 16) + amt
  let g = ((n >> 8) & 0xff) + amt
  let b = (n & 0xff) + amt
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Themes that paint light text on a dark surface. */
const DARK_THEMES = new Set<string>(['dark', 'graphite', 'midnight', 'ocean', 'forest', 'sunset'])

export function isDarkTheme(t: ThemeName): boolean {
  return DARK_THEMES.has(resolveTheme(t))
}

/**
 * Reflect the user's appearance settings onto the document.
 *
 * The browser UI colour is kept in step with the palette on purpose: on Android
 * and in the installed app the system paints its own bar with it, and a pink
 * strip above a graphite app was the last visible leftover of the old look.
 */
export function applyAppearance(s: UserSettings) {
  const root = document.documentElement
  const theme = resolveTheme(s.theme)
  root.setAttribute('data-theme', theme)
  root.style.setProperty('--accent', s.accent)
  root.style.setProperty('--accent-2', shade(s.accent, 40))
  root.style.setProperty('--font-scale', String(s.fontScale))
  root.style.setProperty('--radius-bubble', `${s.bubbleRadius}px`)

  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (bg) {
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', bg)
  }
}

export function resolveTheme(t: UserSettings['theme']) {
  if (t === 'auto') {
    const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    return dark ? 'dark' : 'light'
  }
  return t
}
