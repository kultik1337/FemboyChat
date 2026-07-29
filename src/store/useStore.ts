import { create } from 'zustand'
import type { Account, Attachment, Chat, Directory, Message, Poll, RealtimeEvent, UserSettings } from '../types'
import { getBackend, type Backend } from '../lib/backend'
import { attachmentLabel } from '../lib/media'
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
  previews: Record<string, { text: string; ts: number; senderUid: string; sticker?: string; attachment?: Attachment; deleted?: boolean }>
  directory: Directory[]
  presence: Record<string, { online: boolean; lastSeen: number }>
  typing: Record<string, Record<string, TypingInfo>>
  unread: Record<string, number>
  now: number
  composeReply: Message | null
  composeEdit: Message | null
  /** Files dropped/pasted into the chat, waiting in the composer. */
  pendingFiles: File[]
  /** Chats that still have older messages on the server. */
  hasMore: Record<string, boolean>
  loadingMore: Record<string, boolean>
  /** First page of history is in flight — the view shows a skeleton. */
  loadingChat: Record<string, boolean>

  // ui
  settingsOpen: boolean
  rightPanelOpen: boolean
  newChatKind: 'group' | 'channel' | null
  searchQuery: string
  searchResults: Directory[]
  profileUid: string | null
  toasts: Toast[]
  lightbox: { url: string; name?: string } | null

  // actions
  boot: () => Promise<void>
  goto: (r: Route) => void
  register: (email: string, username: string, name: string, password: string) => Promise<{ ok: boolean; pendingConfirm?: boolean }>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  patchSettings: (patch: Partial<UserSettings>) => Promise<void>
  patchProfile: (patch: Partial<Account>) => Promise<void>

  refreshChats: () => Promise<void>
  openChat: (id: string) => Promise<void>
  loadOlder: (id: string) => Promise<void>
  startWith: (entry: Directory) => Promise<void>
  joinInvite: (code: string) => Promise<void>
  consumePendingInvite: () => Promise<void>
  createChat: (input: {
    type: 'group' | 'channel'
    title: string
    description?: string
    emoji: string
    username?: string
    memberUids?: string[]
  }) => Promise<void>

  send: (input: { text: string; replyToId?: string; sticker?: string; poll?: Poll; ttl?: number; forwardedFrom?: string; attachment?: Attachment }) => Promise<void>
  edit: (id: string, text: string) => Promise<void>
  remove: (id: string) => Promise<void>
  react: (id: string, emoji: string) => Promise<void>
  vote: (id: string, optionIndex: number) => Promise<void>
  pin: (id: string) => Promise<void>
  setComposeReply: (m: Message | null) => void
  setComposeEdit: (m: Message | null) => void
  addPendingFiles: (files: File[]) => void
  removePendingFile: (index: number) => void
  clearPendingFiles: () => void
  setLightbox: (l: { url: string; name?: string } | null) => void
  typingPing: (chatId: string) => void
  /** Pull the real online state of the user's peers from the server. */
  syncPresence: () => Promise<void>

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
/** How many messages one page of history holds. Must match the backend. */
const PAGE_SIZE = 50

/**
 * Presence heartbeat. Without this `last_seen` was only ever written at
 * registration, so every user was permanently shown as "не в сети".
 *
 * The same beat also pulls in everyone else's state, so the two directions stay
 * in step: we announce ourselves and refresh our peers at the same moments
 * (load, focus, tab becoming visible, and once a minute).
 */
let presenceStarted = false
function startPresence(backend: Backend, pull: () => void) {
  if (presenceStarted) return
  presenceStarted = true
  const beat = () => {
    backend.setPresence(document.visibilityState === 'visible')
    pull()
  }
  beat()
  setInterval(beat, 60_000)
  document.addEventListener('visibilitychange', beat)
  window.addEventListener('focus', beat)
  window.addEventListener('beforeunload', () => backend.setPresence(false))
}

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
  composeReply: null,
  composeEdit: null,
  pendingFiles: [],
  hasMore: {},
  loadingMore: {},
  loadingChat: {},

  settingsOpen: false,
  rightPanelOpen: false,
  newChatKind: null,
  searchQuery: '',
  searchResults: [],
  profileUid: null,
  toasts: [],
  lightbox: null,

  async boot() {
    // Invite links look like /#join=CODE — stash the code so it survives the
    // login/register flow for logged-out visitors.
    const joinMatch = /#join=([A-Za-z0-9_-]+)/.exec(location.hash)
    if (joinMatch) {
      localStorage.setItem('fc:pendingInvite', joinMatch[1])
      history.replaceState(null, '', location.pathname + location.search)
    }
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
    if (account) {
      startPresence(backend, () => get().syncPresence())
      await get().refreshChats()
      // Chats are known only now, so this is the first call that has anyone to
      // ask about.
      await get().syncPresence()
      await get().consumePendingInvite()
    }
  },

  async consumePendingInvite() {
    const code = localStorage.getItem('fc:pendingInvite')
    if (!code) return
    localStorage.removeItem('fc:pendingInvite')
    await get().joinInvite(code)
  },

  async joinInvite(code) {
    try {
      const chat = await get().backend!.joinByInvite(code)
      await get().refreshChats()
      await get().openChat(chat.id)
      get().toast(`Вы вступили в «${chat.title}»`, '💌')
    } catch (e) {
      get().toast(e instanceof Error ? e.message : 'Инвайт-ссылка недействительна', '⚠️')
    }
  },

  goto(route) {
    set({ route })
  },

  async register(email, username, name, password) {
    const res = await get().backend!.register(email, username, name, password)
    if (res.ok && res.account) {
      set({ account: res.account, route: 'app', directory: get().backend!.getDirectoryList() })
      startPresence(get().backend!, () => get().syncPresence())
      await get().refreshChats()
      await get().syncPresence()
      await get().consumePendingInvite()
      return { ok: true }
    }
    if (res.pendingConfirm) return { ok: false, pendingConfirm: true }
    if (res.error) get().toast(res.error, '⚠️')
    return { ok: false }
  },

  async login(email, password) {
    const res = await get().backend!.login(email, password)
    if (res.ok && res.account) {
      set({ account: res.account, route: 'app', directory: get().backend!.getDirectoryList() })
      startPresence(get().backend!, () => get().syncPresence())
      await get().refreshChats()
      await get().syncPresence()
      await get().consumePendingInvite()
      return true
    }
    if (res.error) get().toast(res.error, '⚠️')
    return false
  },

  async logout() {
    get().backend?.setPresence(false)
    await get().backend!.logout()
    set({ account: null, route: 'landing', chats: [], activeChatId: null, messages: {}, presence: {}, settingsOpen: false })
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

  /**
   * Ask the server for the real online state of the people this user talks to.
   *
   * Only direct conversations are queried: that is what the UI actually renders
   * a dot for, and it keeps the request small no matter how many groups the
   * user is in. The server applies each peer's privacy setting, so a peer who
   * hides their activity comes back as offline with no last-seen time.
   *
   * A backend without `peerPresence` (demo mode) makes this a no-op and the UI
   * keeps falling back to the directory's coarse flag.
   */
  async syncPresence() {
    const { backend, chats, account } = get()
    if (!backend?.peerPresence || !account) return
    const uids = new Set<string>()
    for (const c of chats) {
      if (c.type !== 'dm' && c.type !== 'bot') continue
      for (const u of c.memberUids) if (u && u !== account.uid) uids.add(u)
    }
    if (uids.size === 0) return
    try {
      const rows = await backend.peerPresence([...uids])
      if (rows.length === 0) return
      set((s) => {
        const presence = { ...s.presence }
        for (const r of rows) {
          presence[r.uid] = { online: r.online, lastSeen: r.lastSeen ?? presence[r.uid]?.lastSeen ?? 0 }
        }
        return { presence }
      })
    } catch {
      /* presence is decoration — never surface a failure for it */
    }
  },

  async refreshChats() {
    const backend = get().backend!
    const chats = await backend.listChats()
    const previews: StoreState['previews'] = { ...get().previews }
    if (backend.listChatPreviews) {
      // Supabase: one RPC returns the last message of every chat instead of
      // downloading the full history of all of them.
      for (const p of await backend.listChatPreviews()) {
        previews[p.chatId] = { text: p.text, ts: p.ts, senderUid: p.senderUid, sticker: p.sticker, attachment: p.attachment, deleted: p.deleted }
      }
    } else {
      // LocalBackend reads from memory, so the per-chat loop is free there.
      await Promise.all(
        chats.map(async (c) => {
          const msgs = await backend.listMessages(c.id)
          const last = msgs[msgs.length - 1]
          if (last) previews[c.id] = { text: last.text, ts: last.ts, senderUid: last.senderUid, sticker: last.sticker, attachment: last.attachment, deleted: last.deleted }
        }),
      )
    }
    set({ chats, previews })
  },

  /**
   * Switch chats. The active chat changes on the same frame and history is
   * fetched afterwards: awaiting the request first meant the old chat stayed
   * on screen for the whole round trip, which is what made switching feel slow.
   */
  async openChat(id) {
    if (!id) {
      set({ activeChatId: null, rightPanelOpen: false })
      return
    }
    const backend = get().backend!
    const cached = get().messages[id] ?? []

    set((s) => ({
      activeChatId: id,
      unread: { ...s.unread, [id]: 0 },
      rightPanelOpen: false,
      searchQuery: '',
      searchResults: [],
      composeReply: null,
      composeEdit: null,
      pendingFiles: [],
      // Only show a skeleton when there is nothing to show yet; a revisit keeps
      // the cached history visible and refreshes it underneath.
      loadingChat: { ...s.loadingChat, [id]: cached.length === 0 },
    }))

    try {
      const msgs = await backend.listMessages(id, { limit: PAGE_SIZE })
      set((s) => ({
        messages: { ...s.messages, [id]: msgs },
        hasMore: { ...s.hasMore, [id]: msgs.length >= PAGE_SIZE },
      }))
    } catch {
      get().toast('Не удалось загрузить историю', '⚠️')
    } finally {
      set((s) => ({ loadingChat: { ...s.loadingChat, [id]: false } }))
    }

    await backend.markRead(id)
    // Opening a conversation is exactly when its dot needs to be right.
    void get().syncPresence()
  },

  /** Prepend one older page of history (infinite scroll upwards). */
  async loadOlder(id) {
    const { backend, messages, hasMore, loadingMore } = get()
    if (!backend || loadingMore[id] || hasMore[id] === false) return
    const current = messages[id] ?? []
    const oldest = current[0]
    if (!oldest) return
    set((s) => ({ loadingMore: { ...s.loadingMore, [id]: true } }))
    try {
      const older = await backend.listMessages(id, { before: oldest.ts, limit: PAGE_SIZE })
      set((s) => ({
        messages: { ...s.messages, [id]: [...older, ...(s.messages[id] ?? [])] },
        hasMore: { ...s.hasMore, [id]: older.length >= PAGE_SIZE },
      }))
    } finally {
      set((s) => ({ loadingMore: { ...s.loadingMore, [id]: false } }))
    }
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

  /**
   * Optimistic send: the bubble appears immediately (dimmed) and is swapped for
   * the server copy once the write lands. Waiting for the round trip before
   * showing anything made every message feel laggy on a slow connection.
   */
  async send(input) {
    const { account, activeChatId, backend } = get()
    if (!account || !activeChatId || !backend) return
    const text = input.text.trim()
    if (!text && !input.sticker && !input.poll && !input.attachment) return

    const chatId = activeChatId
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: Message = {
      id: tempId,
      chatId,
      senderUid: account.uid,
      text,
      ts: Date.now(),
      reactions: [],
      readByUids: [],
      replyToId: input.replyToId,
      sticker: input.sticker,
      poll: input.poll,
      ttl: input.ttl,
      forwardedFrom: input.forwardedFrom,
      attachment: input.attachment,
      pending: true,
    }

    set((s) => ({
      messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), optimistic] },
      previews: {
        ...s.previews,
        [chatId]: { text, ts: optimistic.ts, senderUid: account.uid, sticker: input.sticker, attachment: input.attachment },
      },
      chats: bumpChat(s.chats, chatId),
    }))

    try {
      const saved = await backend.send({
        chatId,
        senderUid: account.uid,
        text,
        replyToId: input.replyToId,
        sticker: input.sticker,
        poll: input.poll,
        ttl: input.ttl,
        forwardedFrom: input.forwardedFrom,
        attachment: input.attachment,
      })
      set((s) => {
        const arr = s.messages[chatId]
        if (!arr) return {}
        // Realtime can deliver our own message before this resolves; in that
        // case just drop the placeholder instead of showing it twice.
        const alreadyThere = arr.some((m) => m.id === saved.id)
        return {
          messages: {
            ...s.messages,
            [chatId]: alreadyThere ? arr.filter((m) => m.id !== tempId) : arr.map((m) => (m.id === tempId ? saved : m)),
          },
        }
      })
    } catch (e) {
      // Keep the bubble so the text is not lost; the view marks it as unsent.
      set((s) => ({
        messages: s.messages[chatId]
          ? { ...s.messages, [chatId]: s.messages[chatId].map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)) }
          : s.messages,
      }))
      get().toast(e instanceof Error ? e.message : 'Сообщение не отправилось', '⚠️')
    }
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

  setComposeReply(m) {
    set({ composeReply: m, composeEdit: null })
  },
  setComposeEdit(m) {
    set({ composeEdit: m, composeReply: null })
  },

  addPendingFiles(files) {
    if (!files.length) return
    set((s) => ({ pendingFiles: [...s.pendingFiles, ...files].slice(0, 10) }))
  },
  removePendingFile(index) {
    set((s) => ({ pendingFiles: s.pendingFiles.filter((_, i) => i !== index) }))
  },
  clearPendingFiles() {
    set({ pendingFiles: [] })
  },
  setLightbox(l) {
    set({ lightbox: l })
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
        const known = state.chats.some((c) => c.id === chatId)
        // Our own message coming back over realtime should replace the optimistic
        // placeholder rather than appear next to it.
        const tempIdx = mine
          ? arr.findIndex((m) => m.pending && m.text === e.message.text && m.sticker === e.message.sticker)
          : -1
        const nextArr = tempIdx >= 0 ? arr.map((m, i) => (i === tempIdx ? e.message : m)) : [...arr, e.message]
        set((s) => ({
          messages: s.messages[chatId] ? { ...s.messages, [chatId]: nextArr } : s.messages,
          unread: !isActive && !mine ? { ...s.unread, [chatId]: (s.unread[chatId] ?? 0) + 1 } : s.unread,
          typing: clearTyping(s.typing, chatId, e.message.senderUid),
          // Patch the sidebar preview locally. Previously this called
          // refreshChats(), which re-downloaded every chat's whole history
          // for each incoming message.
          previews: {
            ...s.previews,
            [chatId]: {
              text: e.message.text,
              ts: e.message.ts,
              senderUid: e.message.senderUid,
              sticker: e.message.sticker,
              attachment: e.message.attachment,
              deleted: e.message.deleted,
            },
          },
          chats: known ? bumpChat(s.chats, chatId) : s.chats,
        }))
        // Only hit the network when the message belongs to a chat we don't know yet.
        if (!known) get().refreshChats()
        if (!mine) {
          // Someone who just wrote is online by definition; reflect that at once
          // instead of waiting for the next heartbeat.
          set((s) =>
            s.presence[e.message.senderUid]
              ? { presence: { ...s.presence, [e.message.senderUid]: { online: true, lastSeen: e.message.ts } } }
              : {},
          )
          const muted = state.chats.find((c) => c.id === chatId)?.muted
          if (state.account?.settings.notifySound && !muted) beep()
          if (isActive) get().backend?.markRead(chatId)
          if (!muted) maybeNotify(state, e.message)
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

/** Move a chat to the top of the list, keeping pinned chats above. */
function bumpChat(chats: Chat[], chatId: string): Chat[] {
  const idx = chats.findIndex((c) => c.id === chatId)
  if (idx < 0) return chats
  const chat = chats[idx]
  const rest = chats.filter((_, i) => i !== idx)
  if (chat.pinned) return [chat, ...rest]
  const firstUnpinned = rest.findIndex((c) => !c.pinned)
  if (firstUnpinned < 0) return [...rest, chat]
  return [...rest.slice(0, firstUnpinned), chat, ...rest.slice(firstUnpinned)]
}

function maybeNotify(state: StoreState, m: Message) {
  if (!state.account?.settings.notifyPreview) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && state.activeChatId === m.chatId) return
  const chat = state.chats.find((c) => c.id === m.chatId)
  try {
    const body = m.text ? m.text.slice(0, 120) : m.attachment ? attachmentLabel(m.attachment) : m.sticker ? `${m.sticker} стикер` : ''
    new Notification(chat?.title ?? 'FemboyChat', { body, silent: true })
  } catch {
    /* ignore */
  }
}
