// ─────────────────── Device identity ───────────────────
//
// A "session" here is a browser profile, not a login: the same browser keeps
// its key across sign-ins, so the sessions list stays readable instead of
// growing a new row every time someone logs in again.

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
  /** Installed as a PWA rather than opened in a tab. */
  standalone: boolean
}

/**
 * Best-effort browser and OS name. Order matters: Yandex, Edge and Opera all
 * carry "Chrome" in their user agent, and every Chromium browser carries
 * "Safari", so the specific markers have to be tested first.
 */
export function deviceInfo(): DeviceInfo {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
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

/** "Chrome · Windows · приложение" */
export function deviceLabel(d: { browser?: string | null; os?: string | null; standalone?: boolean }): string {
  const parts = [d.browser || 'Браузер', d.os || 'Неизвестная система']
  if (d.standalone) parts.push('приложение')
  return parts.join(' · ')
}
