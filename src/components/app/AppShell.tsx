import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Sidebar } from './Sidebar'
import { ChatView } from './ChatView'
import { RightPanel } from './RightPanel'
import { Settings } from '../settings/Settings'
import { NewChatModal } from './NewChatModal'
import { Lightbox } from '../ui/Lightbox'
import { classNames } from '../../lib/util'
import { deviceInfo, deviceKey } from '../../lib/device'

export function AppShell() {
  const activeChatId = useStore((s) => s.activeChatId)
  const mode = useStore((s) => s.mode)
  const unread = useStore((s) => s.unread)
  const account = useStore((s) => s.account)
  const backend = useStore((s) => s.backend)
  const [tipHidden, setTipHidden] = useState(() => localStorage.getItem('fc:hideRealtimeTip') === '1')
  const showTip = mode === 'local' && !tipHidden

  useEffect(() => {
    const total = Object.values(unread).reduce((a, b) => a + b, 0)
    document.title = total > 0 ? `(${total}) FemboyChat 🎀` : 'FemboyChat 🎀 — тёплый мессенджер'
  }, [unread])

  /**
   * Session heartbeat. Announces this device and, more importantly, listens for
   * the answer: `false` means the row was revoked from another device, so this
   * one signs itself out. A network hiccup returns null instead, which must not
   * kick anyone out.
   */
  useEffect(() => {
    const rpc = backend?.rpc
    if (!account || !backend || !rpc) return
    const key = deviceKey()
    const info = deviceInfo()
    let stopped = false

    async function beat() {
      if (stopped) return
      const alive = await rpc!.call(backend, 'register_device', {
        key,
        browser: info.browser,
        os: info.os,
        standalone: info.standalone,
      })
      if (alive === false && !stopped) {
        stopped = true
        useStore.getState().toast('Сеанс на этом устройстве завершён', '🔒')
        await useStore.getState().logout()
      }
    }

    void beat()
    const timer = setInterval(() => void beat(), 120_000)
    const onFocus = () => void beat()
    window.addEventListener('focus', onFocus)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [account?.uid, backend])

  // ⌘/Ctrl+K → focus search · Konami code → easter egg
  useEffect(() => {
    const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']
    let seq: string[] = []
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.getElementById('sidebar-search')?.focus()
        return
      }
      seq = [...seq, e.key.toLowerCase()].slice(-KONAMI.length)
      if (seq.length === KONAMI.length && KONAMI.every((k, i) => seq[i] === k)) {
        useStore.getState().toast('Пасхалка активирована! Ня~ 🎀', '🕹️')
        seq = []
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col">
      {showTip && (
        <div className="flex items-center gap-2 bg-[var(--panel-2)] px-4 py-1.5 text-xs text-[var(--muted)]">
          <span>💡 Демо-режим: чтобы увидеть реальное время, открой сайт в <b className="text-[var(--text)]">двух отдельных окнах</b> (не «дублировать вкладку») и войди разными аккаунтами. Для синхронизации между устройствами подключи Supabase (см. README).</span>
          <button onClick={() => { localStorage.setItem('fc:hideRealtimeTip', '1'); setTipHidden(true) }} className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
            <X size={13} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 md:px-3 md:pb-3 md:pt-2" style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}>
        <div className="mx-auto grid h-full max-w-[1500px] grid-cols-1 overflow-hidden md:grid-cols-[minmax(300px,380px)_1fr] md:rounded-3xl md:border md:border-[var(--border)] md:shadow-xl">
          <aside className={classNames('h-full min-h-0', activeChatId ? 'hidden md:block' : 'block')}>
            <Sidebar />
          </aside>
          <main className={classNames('h-full min-h-0 bg-[var(--bg)]', activeChatId ? 'block' : 'hidden md:block')}>
            <ChatView />
          </main>
        </div>
      </div>

      <RightPanel />
      <Settings />
      <NewChatModal />
      <Lightbox />
    </div>
  )
}
