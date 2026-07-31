import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { applyAppearance } from './lib/appearance'
import { defaultSettings } from './lib/defaults'
import { Landing } from './components/landing/Landing'
import { Auth } from './components/auth/Auth'
import { AppShell } from './components/app/AppShell'
import { Welcome, welcomeSeen } from './components/app/Welcome'
import { Toasts } from './components/ui/Toasts'
import { ContextMenu } from './components/ui/ContextMenu'
import { Effects } from './components/ui/Effects'
import { Logo } from './components/ui/Logo'

/** How long boot may take before the app gives up and shows something usable. */
const BOOT_TIMEOUT_MS = 12_000

export default function App() {
  const ready = useStore((s) => s.ready)
  const route = useStore((s) => s.route)
  const boot = useStore((s) => s.boot)
  const account = useStore((s) => s.account)
  const settings = useStore((s) => s.account?.settings)
  /** Set when the greeting is dismissed in this session, so it never flashes back. */
  const [greeted, setGreeted] = useState(false)

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
      <Toasts />
      <ContextMenu />
      <Effects />
    </>
  )
}
