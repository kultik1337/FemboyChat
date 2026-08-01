import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { Sidebar } from './Sidebar'
import { ChatView } from './ChatView'
import { RightPanel } from './RightPanel'
import { Settings } from '../settings/Settings'
import { NewChatModal } from './NewChatModal'
import { AdminPanel } from './AdminPanel'
import { BotStudio } from './BotStudio'
import { AiAssist } from './AiAssist'
import { Lightbox } from '../ui/Lightbox'
import { LockScreen } from '../ui/LockScreen'
import { InstallPrompt } from '../ui/InstallPrompt'
import { PushPrompt } from '../ui/PushPrompt'
// Our own icons, not lucide's: see src/components/ui/icons.tsx.
import { X } from '../ui/icons'
import { classNames } from '../../lib/util'
import { deviceInfo, deviceKey } from '../../lib/device'
import { lockEnabled, shouldLock, touchLock } from '../../lib/lock'
import { initPwa } from '../../lib/pwa'
import { refreshPush } from '../../lib/push'
import './motion.css'

/** How close to the left edge a finger has to land to mean «back». */
const EDGE_PX = 30
/** How far it has to travel before the chat actually closes. */
const BACK_TRIGGER = 90

/**
 * Panels that live above everything and are opened from several places at
 * once (settings, a menu, a keyboard shortcut). Rather than threading state
 * through half the tree, anyone can dispatch `fc:open-panel`.
 */
type Overlay = 'admin' | 'bots' | 'assist' | null

/** Open one of the shell's overlays from anywhere in the app. */
export function openPanel(panel: Exclude<Overlay, null>): void {
  window.dispatchEvent(new CustomEvent('fc:open-panel', { detail: panel }))
}

export function AppShell() {
  const activeChatId = useStore((s) => s.activeChatId)
  const mode = useStore((s) => s.mode)
  const unread = useStore((s) => s.unread)
  const account = useStore((s) => s.account)
  const backend = useStore((s) => s.backend)
  const openChat = useStore((s) => s.openChat)
  const [tipHidden, setTipHidden] = useState(() => localStorage.getItem('fc:hideRealtimeTip') === '1')
  const showTip = mode === 'local' && !tipHidden
  const animations = account?.settings.animations ?? true
  const [overlay, setOverlay] = useState<Overlay>(null)
  // Код-пароль спрашивается до первого кадра, а не после эффекта: иначе
  // переписка мелькнет на экране до того, как ее закроют.
  const [locked, setLocked] = useState(() => shouldLock())

  /*
    Edge-swipe back. A finger that starts within a few pixels of the left edge
    drags the chat pane sideways and, if it travels far enough, closes it — the
    same gesture iOS and Android use everywhere else, so it needs no teaching.

    Two things it deliberately does NOT do: it never calls preventDefault (that
    would kill scrolling inside the message list), and it gives up the moment
    the movement turns out to be mostly vertical.
  */
  const [drag, setDrag] = useState(0)
  const dragRef = useRef<{ x: number; y: number; live: boolean } | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    if (!activeChatId || e.touches.length !== 1) return
    if (window.matchMedia('(min-width: 768px)').matches) return
    const t = e.touches[0]
    if (t.clientX > EDGE_PX) return
    dragRef.current = { x: t.clientX, y: t.clientY, live: true }
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = dragRef.current
    if (!s?.live) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dy) > Math.abs(dx)) {
      // Scrolling, not going back.
      dragRef.current = null
      setDrag(0)
      return
    }
    setDrag(Math.max(0, Math.min(dx, window.innerWidth)))
  }

  function onTouchEnd() {
    const s = dragRef.current
    dragRef.current = null
    if (!s?.live) return
    const far = drag > BACK_TRIGGER
    setDrag(0)
    if (far) {
      navigator.vibrate?.(6)
      void openChat('')
    }
  }

  const dragging = !!dragRef.current?.live && drag > 0

  useEffect(() => {
    const total = Object.values(unread).reduce((a, b) => a + b, 0)
    document.title = total > 0 ? `(${total}) FemboyChat 🎀` : 'FemboyChat 🎀 — теплый мессенджер'
  }, [unread])

  // Manifest, service worker and the install banner's state.
  useEffect(() => {
    initPwa()
  }, [])

  /**
   * Автоблокировка. Пока окно активно — отмечаем активность; когда возвращаемся
   * на вкладку — спрашиваем, не пора ли снова закрыться.
   */
  useEffect(() => {
    if (!lockEnabled()) return
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        touchLock()
        return
      }
      if (shouldLock()) setLocked(true)
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !locked) touchLock()
    }, 30_000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [locked])

  /** Настройки могут попросить закрыть приложение прямо сейчас. */
  useEffect(() => {
    const onLock = () => setLocked(true)
    window.addEventListener('fc:lock', onLock)
    return () => window.removeEventListener('fc:lock', onLock)
  }, [])

  /** Any part of the app may ask for one of the big panels. */
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as Overlay
      if (detail === 'admin' || detail === 'bots' || detail === 'assist') setOverlay(detail)
    }
    window.addEventListener('fc:open-panel', onOpen)
    return () => window.removeEventListener('fc:open-panel', onOpen)
  }, [])

  /**
   * Push endpoints rotate silently, so an already-subscribed device re-saves its
   * subscription on every boot instead of assuming the stored one still works.
   */
  useEffect(() => {
    if (!account) return
    void refreshPush()
  }, [account?.uid])

  /** Tapping a system notification asks the open tab to jump to that chat. */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; chatId?: string | null } | null
      if (!data || data.type !== 'OPEN_CHAT' || !data.chatId) return
      void useStore.getState().openChat(data.chatId)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

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
        useStore.getState().toast('Сеанс на этом устройстве завершен', '🔒')
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

  // ⌘/Ctrl+K → focus search · ⌘/Ctrl+Shift+A → admin · ⌘/Ctrl+Shift+B → bots
  // · ⌘/Ctrl+Shift+I → ИИ-помощник · ⌘/Ctrl+Shift+L → закрыть приложение
  // · Konami code → easter egg
  useEffect(() => {
    const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']
    let seq: string[] = []
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && !e.shiftKey && key === 'k') {
        e.preventDefault()
        document.getElementById('sidebar-search')?.focus()
        return
      }
      if (mod && e.shiftKey && key === 'a') {
        e.preventDefault()
        setOverlay('admin')
        return
      }
      if (mod && e.shiftKey && key === 'b') {
        e.preventDefault()
        setOverlay('bots')
        return
      }
      if (mod && e.shiftKey && key === 'i') {
        e.preventDefault()
        setOverlay('assist')
        return
      }
      if (mod && e.shiftKey && key === 'l' && lockEnabled()) {
        e.preventDefault()
        window.dispatchEvent(new Event('fc:lock'))
        return
      }
      seq = [...seq, key].slice(-KONAMI.length)
      if (seq.length === KONAMI.length && KONAMI.every((k, i) => seq[i] === k)) {
        useStore.getState().toast('Пасхалка активирована! Ня~ 🎀', '🕹️')
        seq = []
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="safe-bottom flex h-full flex-col overflow-hidden">
      {showTip && (
        <div className="flex items-center gap-2 bg-[var(--panel-2)] px-4 py-1.5 text-xs text-[var(--muted)]">
          <span>💡 Демо-режим: чтобы увидеть реальное время, открой сайт в <b className="text-[var(--text)]">двух отдельных окнах</b> (не «дублировать вкладку») и войди разными аккаунтами. Для синхронизации между устройствами подключи Supabase (см. README).</span>
          <button onClick={() => { localStorage.setItem('fc:hideRealtimeTip', '1'); setTipHidden(true) }} className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
            <X size={13} />
          </button>
        </div>
      )}
      {/*
        fc-frame-pad / fc-frame are hooks for the desktop build: inside the
        Tauri window the app fills every pixel, so titlebar.css strips the
        padding, the rounded corners and the border. In the browser the card
        keeps floating on its gradient.
      */}
      <div className="fc-frame-pad min-h-0 min-w-0 flex-1 md:px-3 md:pb-3 md:pt-2" style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}>
        {/*
          CRITICAL: both tracks are minmax(0, ...). A grid item's automatic
          minimum size is its min-content width, so a plain `1fr` lets one wide
          child (a code block, an unbreakable link, a channel post) grow the
          column past the viewport. The sidebar then gets squeezed and the whole
          page starts scrolling sideways. minmax(0, ...) plus min-w-0 on the
          panes forbids that: overflow has to be handled inside the pane.
        */}
        <div className="fc-frame mx-auto grid h-full w-full max-w-[1500px] grid-cols-1 overflow-hidden md:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] md:rounded-3xl md:border md:border-[var(--border)] md:shadow-xl">
          <aside
            /* Remounting on the way back is what plays the entrance animation. */
            key={activeChatId ? 'aside-hidden' : 'aside'}
            className={classNames(
              'h-full min-h-0 min-w-0 overflow-hidden',
              activeChatId ? 'hidden md:block' : 'block',
              animations && !activeChatId && 'screen-in-left',
            )}
          >
            <Sidebar />
          </aside>
          <main
            key={activeChatId || 'main-empty'}
            className={classNames(
              'h-full min-h-0 min-w-0 overflow-hidden bg-[var(--bg)]',
              activeChatId ? 'block' : 'hidden md:block',
              animations && activeChatId && 'screen-in-right',
              !dragging && 'screen-drag',
              dragging && 'screen-dragging',
            )}
            style={drag ? { transform: `translateX(${drag}px)` } : undefined}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          >
            <ChatView />
          </main>
        </div>
      </div>

      <RightPanel />
      <Settings />
      <NewChatModal />
      {overlay === 'admin' && <AdminPanel onClose={() => setOverlay(null)} />}
      {overlay === 'bots' && <BotStudio onClose={() => setOverlay(null)} />}
      {overlay === 'assist' && <AiAssist onClose={() => setOverlay(null)} />}
      <Lightbox />
      {/*
        These banners are fixed to the bottom of the screen. On a phone that is
        exactly where the composer lives, so inside an open chat they are hidden
        there. On desktop the composer is inside a panel and there is room to
        spare -- hiding them there is what made the install banner look missing,
        because a chat is almost always open on a wide screen.
      */}
      <div className={activeChatId ? 'hidden md:block' : undefined}>
        <InstallPrompt />
        <PushPrompt />
      </div>
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </div>
  )
}
