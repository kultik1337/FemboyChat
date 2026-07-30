import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { applyAppearance } from './lib/appearance'
import { defaultSettings } from './lib/defaults'
import { Landing } from './components/landing/Landing'
import { Auth } from './components/auth/Auth'
import { AppShell } from './components/app/AppShell'
import { TitleBar } from './components/app/TitleBar'
import { Toasts } from './components/ui/Toasts'
import { ContextMenu } from './components/ui/ContextMenu'
import { Logo } from './components/ui/Logo'

export default function App() {
  const ready = useStore((s) => s.ready)
  const route = useStore((s) => s.route)
  const boot = useStore((s) => s.boot)
  const settings = useStore((s) => s.account?.settings)

  useEffect(() => {
    boot()
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

  return (
    <>
      {/*
        The title bar renders nothing in a normal browser tab, so this column is
        equivalent to the old markup there: the routed view is a flex item with
        `min-h-0 flex-1`, which still resolves to the full height its `h-full`
        children expect. Toasts and the context menu stay OUTSIDE the column
        because they are fixed-position overlays and must not become flex items.
      */}
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="min-h-0 flex-1">
          {route === 'landing' && <Landing />}
          {route === 'auth' && <Auth />}
          {route === 'app' && <AppShell />}
        </div>
      </div>
      <Toasts />
      <ContextMenu />
    </>
  )
}
