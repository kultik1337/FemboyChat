import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Sidebar } from './Sidebar'
import { ChatView } from './ChatView'
import { RightPanel } from './RightPanel'
import { Settings } from '../settings/Settings'
import { NewChatModal } from './NewChatModal'
import { EffectsLayer } from '../ui/EffectsLayer'
import { classNames } from '../../lib/util'

export function AppShell() {
  const activeChatId = useStore((s) => s.activeChatId)
  const mode = useStore((s) => s.mode)
  const unread = useStore((s) => s.unread)
  const [tipHidden, setTipHidden] = useState(() => localStorage.getItem('fc:hideRealtimeTip') === '1')
  const showTip = mode === 'local' && !tipHidden

  useEffect(() => {
    const total = Object.values(unread).reduce((a, b) => a + b, 0)
    document.title = total > 0 ? `(${total}) FemboyChat 🎀` : 'FemboyChat 🎀 — тёплый мессенджер'
  }, [unread])

  // ⌘/Ctrl+K → focus search · Konami code → confetti easter egg
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
        useStore.getState().playEffect('confetti')
        useStore.getState().toast('Пасхалка активирована! 🎀', '🕹️')
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
      <div className="min-h-0 flex-1">
        <div className="mx-auto grid h-full max-w-[1500px] grid-cols-1 md:grid-cols-[minmax(300px,380px)_1fr]">
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
      <EffectsLayer />
    </div>
  )
}
