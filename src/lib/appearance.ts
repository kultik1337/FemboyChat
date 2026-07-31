import { defaultSettings } from './defaults'
import type { ThemeName, UserSettings } from '../types'

/**
 * Осветлить/затемнить цвет. Принимает всё, что угодно: цвет приходит из
 * настроек аккаунта, а там может лежать пустота — у свежего аккаунта или
 * у того, кто завёлся до появления очередной настройки. Ошибка здесь — это
 * белый экран вместо мессенджера, поэтому функция никогда не бросает.
 */
function shade(hex: unknown, amt: number) {
  const fallback = defaultSettings().accent
  const raw = typeof hex === 'string' && hex.trim() ? hex.trim() : fallback
  const h = raw.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (!Number.isFinite(n)) return fallback
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
 * Настройки складываются поверх дефолтных: сервер может отдать пустой
 * объект у только созданного аккаунта, и одно отсутствующее поле не должно
 * ронять всё приложение.
 *
 * The browser UI colour is kept in step with the palette on purpose: on Android
 * and in the installed app the system paints its own bar with it, and a pink
 * strip above a graphite app was the last visible leftover of the old look.
 */
export function applyAppearance(s?: Partial<UserSettings> | null) {
  const merged: UserSettings = { ...defaultSettings(), ...(s ?? {}) }
  const root = document.documentElement
  const theme = resolveTheme(merged.theme)
  root.setAttribute('data-theme', theme)
  root.style.setProperty('--accent', String(merged.accent))
  root.style.setProperty('--accent-2', shade(merged.accent, 40))
  root.style.setProperty('--font-scale', String(merged.fontScale))
  root.style.setProperty('--radius-bubble', `${merged.bubbleRadius}px`)

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

export function resolveTheme(t?: UserSettings['theme']) {
  if (!t || t === 'auto') {
    const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    return dark ? 'dark' : 'light'
  }
  return t
}
