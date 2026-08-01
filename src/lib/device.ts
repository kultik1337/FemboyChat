// ─────────────────── Device identity ───────────────────
//
// A "session" here is a browser profile, not a login: the same browser keeps
// its key across sign-ins, so the sessions list stays readable instead of
// growing a new row every time someone logs in again.

import { isDesktopApp } from './desktop'

const KEY_STORAGE = 'fc:device:key'

/**
 * Stable id for this browser, created on first use and kept in localStorage.
 * Clearing site data intentionally produces a new device — that is a different
 * browser profile as far as anyone can tell.
 */
export function deviceKey(): string {
  if (typeof localStorage === 'undefined') return 'unknown'
  let k = localStorage.getItem(KEY_STORAGE)
  if (!k) {
    k =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(KEY_STORAGE, k)
  }
  return k
}

export type DeviceInfo = {
  browser: string
  os: string
  /** Installed as a PWA or running as the desktop app, rather than in a tab. */
  standalone: boolean
}

/**
 * Best-effort browser and OS name. Order matters: Yandex, Edge and Opera all
 * carry "Chrome" in their user agent, and every Chromium browser carries
 * "Safari", so the specific markers have to be tested first.
 *
 * The desktop build is checked before any of that. Tauri renders inside
 * WebView2, whose user agent is indistinguishable from Edge — which is why the
 * sessions list used to claim "Edge · Windows" for someone sitting in the
 * installed app.
 */
export function deviceInfo(): DeviceInfo {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const os = ua.includes('Windows')
    ? 'Windows'
    : ua.includes('Android')
    ? 'Android'
    : ua.includes('iPhone') || ua.includes('iPad')
    ? 'iOS'
    : ua.includes('Mac OS X')
    ? 'macOS'
    : ua.includes('Linux')
    ? 'Linux'
    : 'Неизвестная система'

  if (isDesktopApp()) return { browser: 'FemboyChat', os, standalone: true }

  const browser = ua.includes('YaBrowser')
    ? 'Yandex Browser'
    : ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('OPR/')
    ? 'Opera'
    : ua.includes('Firefox')
    ? 'Firefox'
    : ua.includes('Chrome')
    ? 'Chrome'
    : ua.includes('Safari')
    ? 'Safari'
    : 'Браузер'
  const standalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  return { browser, os, standalone }
}

/** True for phones and tablets, so the list can pick a fitting icon. */
export function isMobileOs(os?: string | null): boolean {
  return os === 'Android' || os === 'iOS'
}

/**
 * "Chrome · Windows · приложение"
 *
 * The desktop app already says FemboyChat in the first slot, so it gets
 * "программа для ПК" instead of a second, vaguer word.
 */
export function deviceLabel(d: { browser?: string | null; os?: string | null; standalone?: boolean }): string {
  const parts = [d.browser || 'Браузер', d.os || 'Неизвестная система']
  if (d.browser === 'FemboyChat') parts.push('программа для ПК')
  else if (d.standalone) parts.push('приложение')
  return parts.join(' · ')
}
