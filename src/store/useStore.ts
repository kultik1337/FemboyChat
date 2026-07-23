import { create } from 'zustand'
import type { Account, Chat, Directory, Message, Poll, RealtimeEvent, UserSettings } from '../types'
import { getBackend, type Backend } from '../lib/backend'
import { beep } from '../lib/sound'

type Route = 'landing' | 'auth' | 'app'

interface TypingInfo {
  name: string
  at: number
}

interface Toast {
  id: string
  text: string
  emoji?: string
}

interface StoreState {
  backend: Backend | null
  mode: 'local' | 'supabase'
  ready: boolean
  route: Route
  account: Account | null

  chats: Chat[]
  activeChatId: string | null
  messages: Record<string, Message[]>
  previews: Record<string, { text: string; ts: number; senderUid: string; sticker?: string; deleted?: boolean }>
  directory: Directory[]
  presence: Record<string, { online: boolean; lastSeen: number }>
  typing: Record<string, Record<string, TypingInfo>>
  unread: Record<string, number>
  now: number

  // ui
  settingsOpen: boolean
  rightPanelOpen: boolean
  newChatKind: 'group' | 'channel' | null
  searchQuery: string
  searchResults: Directory[]
  profileUid: string | null
  toasts: Toast[]

  // actions
  boot: () => Promise<void>
  goto: (r: Route) => void
  requestCode: (email: string, username?: string, name?: string) => ReturnType<Backend['requestCode']>
  verifyCode: (email: string, code: string) => Promise<boolean>
  logout: () => Promise<void>
  patchSettings: (patch: Partial<UserSettings>) => Promise<void>
  patchProfile: (patch: Partial<Account>) => Promise<void>

  refreshChats: () => Promise<void>
  openChat: (id: string) => Promise<void>
  startWith: (entry: Directory) => Promise<void>
  createChat: (input: {
    type: 'group' | 'channel'
    title: string
    description?: string
    emoji: string
    username?: string
    memberUids?: string[]
  }) => Promise<void>

  send: (input: { text: string; replyToId?: string; sticker?: string; poll?: Poll; ttl?: number; forwardedFrom?: string }) => Promise<void>
  edit: (id: string, text: string) => Promise<void>
  remove: (id: string) => Promise<void>
  react: (id: string, emoji: string) => Promise<void>
  vote: (id: string, optionIndex: number) => Promise<void>
  pin: (id: string) => Promise<void>
  typingPing: (chatId: string) => void

  search: (q: string) => void
  toast: (text: string, emoji?: string) => void
  dismissToast: (id: string) => void
  setRightPanel: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setNewChatKind: (k: 'group' | 'channel' | null) => void
  setProfileUid: (uid: string | null) => void
  handleEvent: (e: RealtimeEvent) => void
}

let typingThrottle = 0

export const useStore = create<StoreState>((set, get) => ({
  backend: null,
  mode: 'local',
  ready: false,
  route: 'landing',
  account: null,

  chats: [],
  activeChatId: null,
  messages: {},
  previews: {},
  directory: [],
  presence: {},
  typing: {},
  unread: {},
  now: Date.now(),

  settingsOpen: false,
  rightPanelOpen: false,
  newChatKind: null,
  searchQuery: '',
  searchResults: [],
  profileUid: null,
  toasts: [],

  async boot() {
    const backend = await getBackend()
    backend.subscribe((e) => get().handleEvent(e))
    const account = await backend.restore()
    set({
      backend,
      mode: backend.mode,
      directory: backend.getDirectoryList(),
      account,
      ready: true,
      route: account ? 'app' : 'landing',
    })
    // 1s heartbeat drives relative times, typing expiry, self-destruct.
    setInterval(() => set({ now: Date.now() }), 1000)
    if (account) await get().refreshChats()
  },

  goto(route) {
    set({ route })
  },

  requestCode(email, username, name) {
    return get().backend!.requestCode(email, username, name)
  },

  async verifyCode(email, code) {
    const res = await get().backend!.verifyCode(email, code)
    if (res.ok && res.account) {
      set({ account: res.account, route: 'app', directory: get().backend!.getDirectoryList() })
      await get().refreshChats()
      return true
    }
    if (res.error) get().toast(res.error, '⚠️')
    return false
  },

  async logout() {
    await get().backend!.logout()
    set({ account: null, route: 'landing', chats: [], activeChatId: null, messages: {}, settingsOpen: false })
  },

  async patchSettings(patch) {
    const cur = get().account
    if (!cur) return
    const account = await get().backend!.updateAccount({ settings: { ...cur.settings, ...patch } })
    set({ account })
  },

  async patchProfile(patch) {
    const account = await get().backend!.updateAccount(patch)
    set({ account, directory: get().backend!.getDirectoryList() })
  },

  async refreshChats() {
    const backend = get().backend!
    const chats = await backend.listChats()
    const previews: StoreState['previews'] = { ...get().previews }
    await Promise.all(
      chats.map(async (c) => {
        const msgs = await backend.listMessages(c.id)
        const last = msgs[msgs.length - 1]
        if (last) previews[c.id] = { text: last.text, ts: last.ts, senderUid: last.senderUid, sticker: last.sticker, deleted: last.deleted }
      }),
    )
    set({ chats, previews })
  },

  async openChat(id) {
    if (!id) {
      set({ activeChatId: null, rightPanelOpen: false })
      return
    }
    const backend = get().backend!
    const msgs = await backend.listMessages(id)
    set((s) => ({
      activeChatId: id,
      messages: { ...s.messages, [id]: msgs },
      unread: { ...s.unread, [id]: 0 },
      rightPanelOpen: false,
      searchQuery: '',
      searchResults: [],
    }))
    await backend.markRead(id)
  },

  async startWith(entry) {
    const backend = get().backend!
    const chat = await backend.joinEntity(entry.uid)
    await get().refreshChats()
    await get().openChat(chat.id)
  },

  async createChat(input) {
    const backend = get().backend!
    const chat = await backend.createChat(input)
    await get().refreshChats()
    set({ newChatKind: null })
    await get().openChat(chat.id)
    get().toast(input.type === 'channel' ? 'Канал создан ✨' : 'Группа создана ✨')
  },

  async send(input) {
    const { account, activeChatId, backend } = get()
    if (!account || !activeChatId || !backend) return
    const text = input.text.trim()
    if (!text && !input.sticker && !input.poll) return
    await backend.send({
      chatId: activeChatId,
      senderUid: account.uid,
      text,
      replyToId: input.replyToId,
      sticker: input.sticker,
      poll: input.poll,
      ttl: input.ttl,
      forwardedFrom: input.forwardedFrom,
    })
  },

  async edit(id, text) {
    const { activeChatId, backend } = get()
    if (activeChatId) await backend!.edit(activeChatId, id, text)
  },

  async remove(id) {
    const { activeChatId, backend } = get()
    if (activeChatId) await backend!.remove(activeChatId, id)
  },

  async react(id, emoji) {
    const { activeChatId, backend } = get()
    if (activeChatId) await backend!.react(activeChatId, id, emoji)
  },

  async vote(id, optionIndex) {
    const { activeChatId, backend } = get()
    if (activeChatId) await backend!.votePoll(activeChatId, id, optionIndex)
  },

  async pin(id) {
    const { activeChatId, backend } = get()
    if (activeChatId) await backend!.pin(activeChatId, id)
  },

  typingPing(chatId) {
    const t = Date.now()
    if (t - typingThrottle < 1500) return
    typingThrottle = t
    get().backend?.setTyping(chatId)
  },

  search(q) {
    const results = get().backend?.searchDirectory(q) ?? []
    set({ searchQuery: q, searchResults: results })
  },

  toast(text, emoji) {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, text, emoji }] }))
    setTimeout(() => get().dismissToast(id), 3200)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  setRightPanel(open) {
    set({ rightPanelOpen: open })
  },
  setSettingsOpen(open) {
    set({ settingsOpen: open })
  },
  setNewChatKind(k) {
    set({ newChatKind: k })
  },
  setProfileUid(uid) {
    set({ profileUid: uid, rightPanelOpen: !!uid })
  },

  handleEvent(e) {
    const state = get()
    switch (e.type) {
      case 'message': {
        const { chatId } = e.message
        const arr = state.messages[chatId] ?? []
        // avoid dup if we already have it
        if (arr.some((m) => m.id === e.message.id)) return
        const isActive = state.activeChatId === chatId
        const mine = e.message.senderUid === state.account?.uid
        set((s) => ({
          messages: s.messages[chatId] ? { ...s.messages, [chatId]: [...arr, e.message] } : s.messages,
          unread: !isActive && !mine ? { ...s.unread, [chatId]: (s.unread[chatId] ?? 0) + 1 } : s.unread,
          typing: clearTyping(s.typing, chatId, e.message.senderUid),
        }))
        get().refreshChats()
        if (!mine) {
          if (state.account?.settings.notifySound) beep()
          if (isActive) get().backend?.markRead(chatId)
          maybeNotify(state, e.message)
        }
        break
      }
      case 'message:update': {
        const { chatId, id } = e.message
        set((s) => ({
          messages: s.messages[chatId]
            ? { ...s.messages, [chatId]: s.messages[chatId].map((m) => (m.id === id ? e.message : m)) }
            : s.messages,
        }))
        break
      }
      case 'message:delete': {
        set((s) => ({
          messages: s.messages[e.chatId]
            ? { ...s.messages, [e.chatId]: s.messages[e.chatId].map((m) => (m.id === e.id ? { ...m, deleted: true, text: '' } : m)) }
            : s.messages,
        }))
        break
      }
      case 'typing': {
        if (e.uid === state.account?.uid) return
        set((s) => ({
          typing: { ...s.typing, [e.chatId]: { ...(s.typing[e.chatId] ?? {}), [e.uid]: { name: e.name, at: Date.now() } } },
        }))
        break
      }
      case 'presence': {
        set((s) => ({ presence: { ...s.presence, [e.uid]: { online: e.online, lastSeen: e.lastSeen } } }))
        break
      }
      case 'read': {
        set((s) => {
          const arr = s.messages[e.chatId]
          if (!arr) return {}
          return {
            messages: {
              ...s.messages,
              [e.chatId]: arr.map((m) =>
                m.ts <= e.upToTs && !m.readByUids.includes(e.uid) ? { ...m, readByUids: [...m.readByUids, e.uid] } : m,
              ),
            },
          }
        })
        break
      }
      case 'chat:update': {
        if (state.account && e.chat.memberUids.includes(state.account.uid)) get().refreshChats()
        break
      }
      case 'directory': {
        set((s) => {
          const exists = s.directory.some((d) => d.uid === e.entry.uid)
          return {
            directory: exists ? s.directory.map((d) => (d.uid === e.entry.uid ? e.entry : d)) : [e.entry, ...s.directory],
          }
        })
        break
      }
    }
  },
}))

function clearTyping(typing: StoreState['typing'], chatId: string, uid: string) {
  const chat = typing[chatId]
  if (!chat || !chat[uid]) return typing
  const next = { ...chat }
  delete next[uid]
  return { ...typing, [chatId]: next }
}

function maybeNotify(state: StoreState, m: Message) {
  if (!state.account?.settings.notifyPreview) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && state.activeChatId === m.chatId) return
  const chat = state.chats.find((c) => c.id === m.chatId)
  try {
    new Notification(chat?.title ?? 'FemboyChat', { body: m.text.slice(0, 120), silent: true })
  } catch {
    /* ignore */
  }
}
