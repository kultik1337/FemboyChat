import { useStore } from '../../store/useStore'
import { Sidebar } from './Sidebar'
import { ChatView } from './ChatView'
import { RightPanel } from './RightPanel'
import { Settings } from '../settings/Settings'
import { NewChatModal } from './NewChatModal'
import { classNames } from '../../lib/util'

export function AppShell() {
  const activeChatId = useStore((s) => s.activeChatId)

  return (
    <div className="h-full">
      <div className="mx-auto grid h-full max-w-[1500px] grid-cols-1 md:grid-cols-[minmax(300px,380px)_1fr]">
        {/* Sidebar: full-screen on mobile until a chat is opened */}
        <aside className={classNames('h-full min-h-0', activeChatId ? 'hidden md:block' : 'block')}>
          <Sidebar />
        </aside>
        {/* Chat: full-screen on mobile when a chat is open */}
        <main className={classNames('h-full min-h-0 bg-[var(--bg)]', activeChatId ? 'block' : 'hidden md:block')}>
          <ChatView />
        </main>
      </div>

      <RightPanel />
      <Settings />
      <NewChatModal />
    </div>
  )
}
