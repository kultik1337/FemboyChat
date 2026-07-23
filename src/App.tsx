import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { applyAppearance } from './lib/appearance'
import { defaultSettings } from './lib/defaults'
import { Landing } from './components/landing/Landing'
import { Auth } from './components/auth/Auth'
import { AppShell } from './components/app/AppShell'
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
  useEffect(() => {
    applyAppearance(settings ?? defaultSettings())
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
      {route === 'landing' && <Landing />}
      {route === 'auth' && <Auth />}
      {route === 'app' && <AppShell />}
      <Toasts />
      <ContextMenu />
    </>
  )
}
