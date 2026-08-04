/**
 * Жизнь внутри десктопной оболочки (Tauri).
 *
 * Один и тот же бандл ездит и в браузер, и в приложении, поэтому API
 * окна грузится только динамическим импортом и только тогда, когда мы
 * точно внутри оболочки: в браузере этот кусок кода просто никогда не
 * скачивается.
 *
 * Класс `is-desktop` вешается на <html> до первой отрисовки — иначе интерфейс
 * на мгновение рисуется под плашкой и дёргается вниз.
 */

export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

export function initDesktop(): void {
  if (!isDesktopApp()) return
  document.documentElement.classList.add('is-desktop')
  installNotificationShim()
}

type AppWindow = {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  startDragging: () => Promise<void>
  onResized: (cb: () => void) => Promise<() => void>
}

let cached: Promise<AppWindow | null> | null = null

/** Окно приложения или null в браузере. Никогда не бросает. */
function appWindow(): Promise<AppWindow | null> {
  if (!isDesktopApp()) return Promise.resolve(null)
  if (!cached) {
    cached = import('@tauri-apps/api/window')
      .then((m) => m.getCurrentWindow() as unknown as AppWindow)
      .catch(() => null)
  }
  return cached
}

export async function minimizeWindow(): Promise<void> {
  const w = await appWindow()
  await w?.minimize().catch(() => {})
}

export async function toggleMaximizeWindow(): Promise<void> {
  const w = await appWindow()
  await w?.toggleMaximize().catch(() => {})
}

export async function closeWindow(): Promise<void> {
  const w = await appWindow()
  await w?.close().catch(() => {})
}

export async function isWindowMaximized(): Promise<boolean> {
  const w = await appWindow()
  if (!w) return false
  return w.isMaximized().catch(() => false)
}

/**
 * Подписка на изменение размера окна. Нужна ровно затем, чтобы иконка
 * «развернуть» менялась на «вернуть как было», в том числе когда окно
 * развернули мимо нашей плашки — двойным кликом или Win+↑.
 */
export async function onWindowResized(cb: () => void): Promise<() => void> {
  const w = await appWindow()
  if (!w) return () => {}
  try {
    return await w.onResized(cb)
  } catch {
    return () => {}
  }
}

/* --- Системные уведомления ------------------------------------------------ */

type NotificationPlugin = {
  isPermissionGranted: () => Promise<boolean>
  requestPermission: () => Promise<string>
  sendNotification: (options: { title: string; body?: string }) => void
}

let plugin: Promise<NotificationPlugin | null> | null = null

function notifications(): Promise<NotificationPlugin | null> {
  if (!isDesktopApp()) return Promise.resolve(null)
  if (!plugin) {
    plugin = import('@tauri-apps/plugin-notification')
      .then((m) => m as unknown as NotificationPlugin)
      .catch(() => null)
  }
  return plugin
}

/**
 * Показать уведомление силами системы. Право спрашивается лениво — в тот
 * момент, когда показать уже есть что, а не на старте: запрос в пустоту
 * раздражает и чаще всего получает отказ.
 */
async function sendSystemNotification(title: string, body?: string): Promise<void> {
  const api = await notifications()
  if (!api) return
  try {
    let allowed = await api.isPermissionGranted()
    if (!allowed) allowed = (await api.requestPermission()) === 'granted'
    if (allowed) api.sendNotification({ title, body })
  } catch {
    /* уведомление — не причина ломать чат */
  }
}

/**
 * Подмена глобального `Notification` внутри приложения.
 *
 * WebView2 не реализует браузерные уведомления: обычный `new Notification(...)`
 * внутри окна либо бросает, либо молча ничего не показывает — именно поэтому
 * в приложении уведомлений не было, хотя в браузере они работали.
 *
 * Вместо того чтобы разводить по всему коду ветки «если десктоп — одно, иначе
 * другое», подменяется сам глобальный класс. Вся остальная логика (когда
 * уведомлять, что писать, уважать ли настройки и беззвучные чаты) остаётся
 * ровно одна и та же для браузера и приложения.
 *
 * Класс подменяется безусловно, даже если WebView2 вдруг отдаёт свой:
 * тот, что он отдаёт, всё равно ничего не рисует.
 */
function installNotificationShim(): void {
  class DesktopNotification {
    static permission = 'granted'

    static requestPermission(): Promise<string> {
      return Promise.resolve('granted')
    }

    constructor(title: string, options?: { body?: string }) {
      void sendSystemNotification(title, options?.body)
    }

    /** Системное уведомление закрывает сама Windows, закрывать нечего. */
    close(): void {}
  }

  try {
    Object.defineProperty(window, 'Notification', {
      value: DesktopNotification,
      configurable: true,
      writable: true,
    })
  } catch {
    /* если окружение не даёт подменить — остаёмся без уведомлений, но живые */
  }
}
