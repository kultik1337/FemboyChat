import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { applyAppearance } from './lib/appearance'
import { defaultSettings } from './lib/defaults'
import { Landing } from './components/landing/Landing'
import { Auth } from './components/auth/Auth'
import { AppShell } from './components/app/AppShell'
import { Toasts } from './components/ui/Toasts'

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

  if (!ready) {
    return (
      <div className="grid h-full place-items-center" style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 animate-float place-items-center rounded-2xl accent-gradient text-3xl text-white shadow-lg">💬</div>
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
    </>
  )
}
