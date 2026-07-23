import type { Account, Chat, Directory, Message, RealtimeEvent, UserSettings } from '../../types'
import { defaultSettings } from '../defaults'
import { botReply, seedAccounts, seedChats, seedDirectory, seedMessages } from '../seed'
import { normalizeUsername, uid as rid } from '../util'
import type { Backend, RequestCodeResult, VerifyResult } from './types'

const K = {
  counter: 'fc:counter',
  accounts: 'fc:accounts',
  directory: 'fc:directory',
  chats: 'fc:chats',
  msgs: 'fc:msgs',
  codes: 'fc:codes',
  seeded: 'fc:seeded:v1',
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* quota — ignore for demo */
  }
}

type Accounts = Record<string, Account>
type Chats = Record<string, Chat>
type Msgs = Record<string, Message[]>
type Codes = Record<string, { code: string; ts: number; username?: string; name?: string }>

export class LocalBackend implements Backend {
  readonly mode = 'local' as const
  private bc: BroadcastChannel | null = null
  private subs = new Set<(e: RealtimeEvent) => void>()
  private sessionUid: string | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null

  async init() {
    if (!read<boolean>(K.seeded, false)) {
      const accounts: Accounts = {}
      for (const a of seedAccounts) accounts[a.uid] = a
      const chats: Chats = {}
      for (const c of seedChats) chats[c.id] = c
      write(K.accounts, accounts)
      write(K.chats, chats)
      write(K.directory, seedDirectory)
      write(K.msgs, seedMessages)
      write(K.counter, seedAccounts.length + 1)
      write(K.seeded, true)
    }
    try {
      this.bc = new BroadcastChannel('femboychat')
      this.bc.onmessage = (ev) => {
        const e = ev.data as RealtimeEvent
        this.subs.forEach((cb) => cb(e))
      }
    } catch {
      // Safari private mode etc. — fall back to storage events.
      window.addEventListener('storage', (ev) => {
        if (ev.key === 'fc:bus' && ev.newValue) {
          try {
            this.subs.forEach((cb) => cb(JSON.parse(ev.newValue!) as RealtimeEvent))
          } catch {
            /* ignore */
          }
        }
      })
    }
    this.sessionUid = sessionStorage.getItem('fc:session')
  }

  // ── low-level accessors ──
  private accounts(): Accounts {
    return read<Accounts>(K.accounts, {})
  }
  private chats(): Chats {
    return read<Chats>(K.chats, {})
  }
  private msgs(): Msgs {
    return read<Msgs>(K.msgs, {})
  }
  private directory(): Directory[] {
    return read<Directory[]>(K.directory, [])
  }

  private emit(e: RealtimeEvent) {
    // local subscribers (this tab)
    this.subs.forEach((cb) => cb(e))
    // other tabs
    if (this.bc) this.bc.postMessage(e)
    else write('fc:bus', { ...e, _n: Math.random() })
  }

  private me(): Account | undefined {
    return this.sessionUid ? this.accounts()[this.sessionUid] : undefined
  }

  // ── auth ──
  async requestCode(email: string, username?: string, name?: string): Promise<RequestCodeResult> {
    email = email.trim().toLowerCase()
    const accounts = this.accounts()
    const existing = Object.values(accounts).find((a) => a.email === email)
    const isNew = !existing
    if (isNew) {
      const uname = normalizeUsername(username ?? '')
      if (!uname || uname.length < 3)
        return { ok: false, isNew, error: 'Юзернейм должен быть не короче 3 символов' }
      const taken = Object.values(accounts).some((a) => a.username === uname)
      if (taken) return { ok: false, isNew, error: 'Этот юзернейм уже занят' }
    }
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const codes = read<Codes>(K.codes, {})
    codes[email] = { code, ts: Date.now(), username: normalizeUsername(username ?? ''), name }
    write(K.codes, codes)
    // In a real deployment this is where an email is sent. In local/demo mode
    // we surface the code directly so the flow is fully usable offline.
    console.info(`[FemboyChat] Код для ${email}: ${code}`)
    return { ok: true, isNew, devCode: code }
  }

  async verifyCode(email: string, code: string): Promise<VerifyResult> {
    email = email.trim().toLowerCase()
    const codes = read<Codes>(K.codes, {})
    const rec = codes[email]
    if (!rec) return { ok: false, error: 'Сначала запросите код' }
    if (Date.now() - rec.ts > 10 * 60_000) return { ok: false, error: 'Код истёк, запросите новый' }
    if (rec.code !== code.trim()) return { ok: false, error: 'Неверный код' }

    const accounts = this.accounts()
    let account = Object.values(accounts).find((a) => a.email === email)
    if (!account) {
      const nextId = read<number>(K.counter, 1)
      write(K.counter, nextId + 1)
      account = {
        numId: nextId,
        uid: rid(),
        username: rec.username || `user${nextId}`,
        name: rec.name || rec.username || `Пользователь ${nextId}`,
        email,
        bio: '',
        emoji: '🎀',
        color: '#ff7ab8',
        status: '',
        verified: false,
        isBot: false,
        createdAt: Date.now(),
        lastSeen: Date.now(),
        settings: defaultSettings(),
      }
      accounts[account.uid] = account
      write(K.accounts, accounts)
      this.addToDirectory(account)
      this.onboard(account)
    }
    delete codes[email]
    write(K.codes, codes)
    this.sessionUid = account.uid
    sessionStorage.setItem('fc:session', account.uid)
    this.startPresence()
    return { ok: true, account }
  }

  private addToDirectory(a: Account) {
    const dir = this.directory()
    if (!dir.some((d) => d.uid === a.uid)) {
      dir.unshift({
        uid: a.uid,
        kind: 'user',
        numId: a.numId,
        username: a.username,
        name: a.name,
        emoji: a.emoji,
        color: a.color,
        bio: a.bio,
        verified: a.verified,
        online: true,
      })
      write(K.directory, dir)
    }
  }

  /** First-login onboarding: saved messages, a welcome bot DM, and a couple of communities. */
  private onboard(a: Account) {
    const chats = this.chats()
    const msgs = this.msgs()
    const now = Date.now()

    const saved: Chat = {
      id: `saved-${a.uid}`,
      type: 'saved',
      title: 'Избранное',
      emoji: '🔖',
      color: '#7cc4ff',
      memberUids: [a.uid],
      adminUids: [a.uid],
      ownerUid: a.uid,
      createdAt: now,
    }
    chats[saved.id] = saved
    msgs[saved.id] = [
      {
        id: rid(),
        chatId: saved.id,
        senderUid: a.uid,
        text: 'Это твоё «Избранное» — личное пространство для заметок, ссылок и файлов 🔖',
        ts: now,
        reactions: [],
        readByUids: [a.uid],
      },
    ]

    // Welcome DM from FemBot
    const botUid = 'bot-fem'
    const dmId = this.dmId(a.uid, botUid)
    chats[dmId] = {
      id: dmId,
      type: 'bot',
      title: 'FemBot',
      emoji: '🤖',
      color: '#7cc4ff',
      memberUids: [a.uid, botUid],
      adminUids: [],
      createdAt: now,
    }
    msgs[dmId] = [
      {
        id: rid(),
        chatId: dmId,
        senderUid: botUid,
        text: `Привет, ${a.name}! 🎀 Добро пожаловать в FemboyChat. Твой номер аккаунта — #${a.numId}. Напиши /help, чтобы узнать что я умею.`,
        ts: now,
        reactions: [],
        readByUids: [],
      },
    ]

    // Join the official channel + lounge group
    for (const cid of ['chan-news', 'grp-lounge']) {
      const c = chats[cid]
      if (c && !c.memberUids.includes(a.uid)) {
        c.memberUids.push(a.uid)
        if (typeof c.memberCount === 'number') c.memberCount += 1
      }
    }
    write(K.chats, chats)
    write(K.msgs, msgs)
  }

  async restore(): Promise<Account | null> {
    const a = this.me()
    if (a) this.startPresence()
    return a ?? null
  }

  async logout() {
    this.setPresence(false)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.sessionUid = null
    sessionStorage.removeItem('fc:session')
  }

  async updateAccount(patch: Partial<Account>): Promise<Account> {
    const accounts = this.accounts()
    const cur = this.me()
    if (!cur) throw new Error('not authed')
    const next: Account = { ...cur, ...patch, settings: { ...cur.settings, ...(patch.settings as UserSettings) } }
    accounts[cur.uid] = next
    write(K.accounts, accounts)
    // reflect in directory
    const dir = this.directory()
    const idx = dir.findIndex((d) => d.uid === cur.uid)
    if (idx >= 0) {
      dir[idx] = { ...dir[idx], name: next.name, username: next.username, emoji: next.emoji, color: next.color, bio: next.bio }
      write(K.directory, dir)
      this.emit({ type: 'directory', entry: dir[idx] })
    }
    return next
  }

  // ── directory / search ──
  getDirectoryList(): Directory[] {
    return this.directory()
  }

  searchDirectory(q: string): Directory[] {
    const dir = this.directory()
    const me = this.me()
    const list = dir.filter((d) => d.uid !== me?.uid)
    const query = q.trim().toLowerCase().replace(/^@/, '')
    if (!query) {
      // Trending: communities by members, then a few people.
      return [...list].sort((a, b) => (b.members ?? 0) - (a.members ?? 0)).slice(0, 20)
    }
    const scored = list
      .map((d) => {
        const name = d.name.toLowerCase()
        const uname = d.username.toLowerCase()
        let score = 0
        if (uname === query || String(d.numId) === query) score = 100
        else if (uname.startsWith(query)) score = 80
        else if (name.startsWith(query)) score = 70
        else if (uname.includes(query)) score = 50
        else if (name.includes(query)) score = 45
        else if (d.bio.toLowerCase().includes(query)) score = 20
        if (d.verified) score += 3
        return { d, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
    return scored.map((x) => x.d)
  }

  // ── chats ──
  private dmId(a: string, b: string) {
    return 'dm-' + [a, b].sort().join('~')
  }

  async listChats(): Promise<Chat[]> {
    const me = this.me()
    if (!me) return []
    const chats = Object.values(this.chats()).filter(
      (c) => c.memberUids.includes(me.uid) || (c.type === 'saved' && c.ownerUid === me.uid),
    )
    const msgs = this.msgs()
    const lastTs = (c: Chat) => {
      const arr = msgs[c.id]
      return arr && arr.length ? arr[arr.length - 1].ts : c.createdAt
    }
    return chats.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      return lastTs(b) - lastTs(a)
    })
  }

  getChat(id: string): Chat | undefined {
    return this.chats()[id]
  }

  async createChat(input: {
    type: 'group' | 'channel'
    title: string
    description?: string
    emoji: string
    username?: string
    memberUids?: string[]
  }): Promise<Chat> {
    const me = this.me()
    if (!me) throw new Error('not authed')
    const chats = this.chats()
    const chat: Chat = {
      id: (input.type === 'channel' ? 'chan-' : 'grp-') + rid().slice(0, 8),
      type: input.type,
      title: input.title,
      username: input.username ? normalizeUsername(input.username) : undefined,
      emoji: input.emoji,
      color: me.color,
      description: input.description,
      memberUids: Array.from(new Set([me.uid, ...(input.memberUids ?? [])])),
      adminUids: [me.uid],
      ownerUid: me.uid,
      memberCount: 1 + (input.memberUids?.length ?? 0),
      createdAt: Date.now(),
    }
    chats[chat.id] = chat
    write(K.chats, chats)
    // publish to directory so it's searchable
    const dir = this.directory()
    dir.unshift({
      uid: chat.id,
      kind: input.type,
      numId: 0,
      username: chat.username ?? '',
      name: chat.title,
      emoji: chat.emoji,
      color: chat.color,
      bio: chat.description ?? '',
      verified: false,
      members: chat.memberCount,
    })
    write(K.directory, dir)
    this.emit({ type: 'chat:update', chat })
    return chat
  }

  async openDM(otherUid: string): Promise<Chat> {
    const me = this.me()
    if (!me) throw new Error('not authed')
    const id = this.dmId(me.uid, otherUid)
    const chats = this.chats()
    if (chats[id]) return chats[id]
    const other = this.accounts()[otherUid]
    const dirEntry = this.directory().find((d) => d.uid === otherUid)
    const isBot = other?.isBot ?? dirEntry?.kind === 'bot'
    const chat: Chat = {
      id,
      type: isBot ? 'bot' : 'dm',
      title: other?.name ?? dirEntry?.name ?? 'Чат',
      emoji: other?.emoji ?? dirEntry?.emoji ?? '💬',
      color: other?.color ?? dirEntry?.color ?? '#ff7ab8',
      memberUids: [me.uid, otherUid],
      adminUids: [],
      createdAt: Date.now(),
    }
    chats[id] = chat
    write(K.chats, chats)
    this.emit({ type: 'chat:update', chat })
    return chat
  }

  async joinEntity(entityUid: string): Promise<Chat> {
    const me = this.me()
    if (!me) throw new Error('not authed')
    const dir = this.directory().find((d) => d.uid === entityUid)
    if (dir && (dir.kind === 'user' || dir.kind === 'bot')) return this.openDM(entityUid)
    const chats = this.chats()
    const chat = chats[entityUid]
    if (!chat) throw new Error('not found')
    if (!chat.memberUids.includes(me.uid)) {
      chat.memberUids.push(me.uid)
      if (typeof chat.memberCount === 'number') chat.memberCount += 1
      write(K.chats, chats)
      this.emit({ type: 'chat:update', chat })
    }
    return chat
  }

  async updateChat(id: string, patch: Partial<Chat>): Promise<Chat> {
    const chats = this.chats()
    const chat = { ...chats[id], ...patch } as Chat
    chats[id] = chat
    write(K.chats, chats)
    this.emit({ type: 'chat:update', chat })
    return chat
  }

  async leaveChat(id: string) {
    const me = this.me()
    if (!me) return
    const chats = this.chats()
    const chat = chats[id]
    if (!chat) return
    chat.memberUids = chat.memberUids.filter((u) => u !== me.uid)
    if (typeof chat.memberCount === 'number') chat.memberCount = Math.max(0, chat.memberCount - 1)
    write(K.chats, chats)
    this.emit({ type: 'chat:update', chat })
  }

  // ── messages ──
  async listMessages(chatId: string): Promise<Message[]> {
    return this.msgs()[chatId] ?? []
  }

  async send(input: Omit<Message, 'id' | 'ts' | 'reactions' | 'readByUids'>): Promise<Message> {
    const me = this.me()
    if (!me) throw new Error('not authed')
    const message: Message = {
      ...input,
      id: rid(),
      ts: Date.now(),
      reactions: [],
      readByUids: [me.uid],
    }
    const msgs = this.msgs()
    ;(msgs[message.chatId] ??= []).push(message)
    write(K.msgs, msgs)
    this.emit({ type: 'message', message })

    // Bot auto-reply for bot chats.
    const chat = this.chats()[message.chatId]
    if (chat && chat.type === 'bot' && message.senderUid === me.uid) {
      const botUid = chat.memberUids.find((u) => u !== me.uid)
      const botAcc = botUid ? this.accounts()[botUid] : undefined
      if (botUid && botAcc?.isBot) {
        setTimeout(() => this.emit({ type: 'typing', chatId: chat.id, uid: botUid, name: botAcc.name }), 500)
        setTimeout(() => {
          const reply: Message = {
            id: rid(),
            chatId: chat.id,
            senderUid: botUid,
            text: botReply(botUid, message.text),
            ts: Date.now(),
            reactions: [],
            readByUids: [botUid],
          }
          const m2 = this.msgs()
          ;(m2[chat.id] ??= []).push(reply)
          write(K.msgs, m2)
          this.emit({ type: 'message', message: reply })
        }, 1500)
      }
    }
    return message
  }

  private mutateMsg(chatId: string, id: string, fn: (m: Message) => void) {
    const msgs = this.msgs()
    const arr = msgs[chatId]
    if (!arr) return
    const m = arr.find((x) => x.id === id)
    if (!m) return
    fn(m)
    write(K.msgs, msgs)
    this.emit({ type: 'message:update', message: m })
  }

  async edit(chatId: string, id: string, text: string) {
    this.mutateMsg(chatId, id, (m) => {
      m.text = text
      m.editedTs = Date.now()
    })
  }

  async remove(chatId: string, id: string) {
    this.mutateMsg(chatId, id, (m) => {
      m.deleted = true
      m.text = ''
      m.reactions = []
    })
  }

  async react(chatId: string, id: string, emoji: string) {
    const me = this.me()
    if (!me) return
    this.mutateMsg(chatId, id, (m) => {
      let r = m.reactions.find((x) => x.emoji === emoji)
      if (!r) {
        r = { emoji, uids: [] }
        m.reactions.push(r)
      }
      if (r.uids.includes(me.uid)) {
        r.uids = r.uids.filter((u) => u !== me.uid)
        if (!r.uids.length) m.reactions = m.reactions.filter((x) => x.emoji !== emoji)
      } else {
        r.uids.push(me.uid)
      }
    })
  }

  async votePoll(chatId: string, id: string, optionIndex: number) {
    const me = this.me()
    if (!me) return
    this.mutateMsg(chatId, id, (m) => {
      if (!m.poll) return
      if (!m.poll.multi) m.poll.options.forEach((o) => (o.uids = o.uids.filter((u) => u !== me.uid)))
      const opt = m.poll.options[optionIndex]
      if (!opt) return
      if (opt.uids.includes(me.uid)) opt.uids = opt.uids.filter((u) => u !== me.uid)
      else opt.uids.push(me.uid)
    })
  }

  async pin(chatId: string, id: string) {
    this.mutateMsg(chatId, id, (m) => {
      m.pinned = !m.pinned
    })
  }

  async markRead(chatId: string) {
    const me = this.me()
    if (!me) return
    const msgs = this.msgs()
    const arr = msgs[chatId]
    if (!arr) return
    let changed = false
    for (const m of arr)
      if (!m.readByUids.includes(me.uid)) {
        m.readByUids.push(me.uid)
        changed = true
      }
    if (changed) {
      write(K.msgs, msgs)
      this.emit({ type: 'read', chatId, uid: me.uid, upToTs: Date.now() })
    }
  }

  // ── presence / typing ──
  private startPresence() {
    this.setPresence(true)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = setInterval(() => this.setPresence(true), 30_000)
    window.addEventListener('beforeunload', () => this.setPresence(false))
  }

  setTyping(chatId: string) {
    const me = this.me()
    if (!me) return
    this.emit({ type: 'typing', chatId, uid: me.uid, name: me.name })
  }

  setPresence(online: boolean) {
    const me = this.me()
    if (!me) return
    if (me.settings.ghostMode) online = false
    const accounts = this.accounts()
    accounts[me.uid] = { ...me, lastSeen: Date.now() }
    write(K.accounts, accounts)
    this.emit({ type: 'presence', uid: me.uid, lastSeen: Date.now(), online })
  }

  subscribe(cb: (e: RealtimeEvent) => void) {
    this.subs.add(cb)
    return () => this.subs.delete(cb)
  }
}
