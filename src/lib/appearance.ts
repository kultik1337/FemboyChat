import type { UserSettings } from '../types'

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

/** Reflect the user's appearance settings onto the document. */
export function applyAppearance(s: UserSettings) {
  const root = document.documentElement
  root.setAttribute('data-theme', resolveTheme(s.theme))
  root.style.setProperty('--accent', s.accent)
  root.style.setProperty('--accent-2', shade(s.accent, 40))
  root.style.setProperty('--font-scale', String(s.fontScale))
  root.style.setProperty('--radius-bubble', `${s.bubbleRadius}px`)
}

export function resolveTheme(t: UserSettings['theme']) {
  return t
}
