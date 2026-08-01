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
