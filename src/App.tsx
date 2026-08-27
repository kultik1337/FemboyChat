import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { applyAppearance } from './lib/appearance'
import { defaultSettings } from './lib/defaults'
import { Landing } from './components/landing/Landing'
import { Auth } from './components/auth/Auth'
import { AppShell } from './components/app/AppShell'
import { AdminConsole } from './components/admin/AdminConsole'
import { NotFound } from './components/app/NotFound'
import { Welcome, welcomeSeen } from './components/app/Welcome'
import { UpdateBanner } from './components/app/UpdateBanner'
import { ScheduledPanel } from './components/app/ScheduledPanel'
import { Toasts } from './components/ui/Toasts'
import { ContextMenu } from './components/ui/ContextMenu'
import { Effects } from './components/ui/Effects'
import { Logo } from './components/ui/Logo'

/** How long boot may take before the app gives up and shows something usable. */
const BOOT_TIMEOUT_MS = 12_000

/** Адрес админки. Отдельная страница, а не модалка: её можно открыть ссылкой,
 *  обновить и закрыть кнопкой «назад» браузера. */
export const ADMIN_HASH = '#admin'

/** Открыть страницу админ-управления из любого места приложения. */
export function openAdminPage(): void {
  window.location.hash = 'admin'
}

/** Хеши, которые приложение действительно умеет открывать. */
const KNOWN_HASHES = new Set(['', '#', ADMIN_HASH])

/**
 * Supabase возвращает человека из письма с токенами в хеше: подтверждение
 * почты, сброс пароля, магическая ссылка. Такой адрес выглядит «неизвестным»,
 * но это самый настоящий вход — показать на нём 404 значит сломать
 * восстановление доступа.
 */
function isAuthCallbackHash(hash: string): boolean {
  return /access_token|refresh_token|provider_token|error_code|error_description|type=(recovery|signup|invite|magiclink|email_change)/.test(hash)
}

/**
 * Сайт живёт в корне домена, а хостинг отдаёт index.html на любой путь
 * (SPA-фолбэк). Поэтому «страница не найдена» решается здесь, а не сервером:
 * до этой проверки любой мусор после слеша молча показывал обычный мессенджер.
 */
function isKnownPath(pathname: string): boolean {
  return pathname === '' || pathname === '/' || pathname === '/index.html'
}

/** Единая точка правды о том, битая ли ссылка. */
export function isNotFoundUrl(pathname: string, hash: string): boolean {
  if (!isKnownPath(pathname)) return true
  if (!hash || KNOWN_HASHES.has(hash)) return false
  if (isAuthCallbackHash(hash)) return false
  return true
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const route = useStore((s) => s.route)
  const boot = useStore((s) => s.boot)
  const account = useStore((s) => s.account)
  const settings = useStore((s) => s.account?.settings)
  /** Set when the greeting is dismissed in this session, so it never flashes back. */
  const [greeted, setGreeted] = useState(false)
  /** Хеш-маршрут: им пользуются админка и определение битой ссылки. */
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash))

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let settled = false

    // boot() sets `ready` as its last step, so anything that threw or stalled on
    // the way there left the app on the loading screen forever, with no error
    // shown anywhere. One unreachable request or one bad row in the database
    // should degrade into "log in again", never into an eternal spinner.
    const giveUp = (reason: string, err?: unknown) => {
      if (settled) return
      settled = true
      console.error('[boot] ' + reason, err)
      const s = useStore.getState()
      if (s.ready) return
      useStore.setState({ ready: true, route: s.account ? 'app' : 'landing' })
      s.toast('Не удалось загрузить всё до конца — попробуй обновить страницу', '⚠️')
    }

    const watchdog = setTimeout(() => giveUp('timed out'), BOOT_TIMEOUT_MS)
    boot().then(
      () => {
        settled = true
        clearTimeout(watchdog)
      },
      (err) => giveUp('failed', err),
    )

    return () => clearTimeout(watchdog)
  }, [boot])

  // Apply appearance whenever settings change (and a sensible default before login).
  // In «auto» theme, follow the OS light/dark switch live.
  useEffect(() => {
    const s = settings ?? defaultSettings()
    applyAppearance(s)
    if (s.theme !== 'auto' || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyAppearance(s)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings])

  // Suppress the browser's native context menu everywhere except inside text
  // fields (so cut/copy/paste still works when editing a message) — the app
  // provides its own right-click menus instead.
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
    }
    document.addEventListener('contextmenu', onCtx)
    return () => document.removeEventListener('contextmenu', onCtx)
  }, [])

  /*
    404 проверяется до загрузочного экрана и до всякой авторизации: битый адрес
    остаётся битым независимо от того, вошёл человек или нет, и заставлять его
    сначала смотреть на спиннер незачем.
  */
  const notFound =
    typeof window !== 'undefined' && isNotFoundUrl(window.location.pathname, hash)

  if (notFound) {
    return (
      <>
        <NotFound url={window.location.href} />
        <Toasts />
      </>
    )
  }

  if (!ready) {
    return (
      <div className="grid h-full place-items-center" style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}>
        <div className="flex flex-col items-center gap-3">
          <Logo size={64} className="animate-float !rounded-2xl" />
          <div className="text-sm font-semibold text-[var(--muted)]">Загружаем FemboyChat…</div>
        </div>
      </div>
    )
  }

  /*
    Админка — полноэкранная страница поверх маршрута «app». Живёт на хеше, чтобы
    её нельзя было случайно «открыть» в неавторизованном состоянии: без аккаунта
    хеш просто игнорируется, а сама страница ещё раз проверяет права (и, что
    важнее, каждая admin_* функция проверяет их в базе).
  */
  const adminOpen = route === 'app' && !!account && hash === ADMIN_HASH

  const closeAdmin = () => {
    // replaceState вместо hash = '': не оставляем пустую запись в истории.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setHash('')
  }

  if (adminOpen) {
    return (
      <>
        <AdminConsole onClose={closeAdmin} />
        <Toasts />
        <ContextMenu />
        <Effects />
      </>
    )
  }

  /*
    The greeting sits on top of the app rather than replacing it: the chat list
    is already loading behind the card, so closing the last step drops straight
    into a working messenger instead of a second loading screen.
  */
  const showWelcome = route === 'app' && !!account && !greeted && !welcomeSeen(account.uid)

  return (
    <>
      {route === 'landing' && <Landing />}
      {route === 'auth' && <Auth />}
      {route === 'app' && <AppShell />}
      {showWelcome && <Welcome onDone={() => setGreeted(true)} />}
      {/* Только в работающем приложении и не поверх приветствия: человек,
          который только что завёл аккаунт, не должен первым делом читать про
          установщик. В браузере компонент ничего не рисует сам. */}
      {route === 'app' && !showWelcome && <UpdateBanner />}
      {/* Окно отложенных сообщений живёт здесь, а не внутри чата: оно показывает
          заготовки сразу по всем чатам и не должно зависеть от того, какой диалог
          открыт. Само по себе ничего не рисует, пока его не откроют. */}
      {route === 'app' && <ScheduledPanel />}
      <Toasts />
      <ContextMenu />
      <Effects />
    </>
  )
}
