import { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Sidebar } from './Sidebar'
import { ChatView } from './ChatView'
import { RightPanel } from './RightPanel'
import { Settings } from '../settings/Settings'
import { NewChatModal } from './NewChatModal'
import { classNames } from '../../lib/util'

export function AppShell() {
  const activeChatId = useStore((s) => s.activeChatId)
  const mode = useStore((s) => s.mode)
  const [tipHidden, setTipHidden] = useState(() => localStorage.getItem('fc:hideRealtimeTip') === '1')
  const showTip = mode === 'local' && !tipHidden

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
    </div>
  )
}
