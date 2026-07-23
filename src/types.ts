// ───────────────────────── Domain types ─────────────────────────

export type EntityKind = 'user' | 'group' | 'channel' | 'bot'

export interface UserSettings {
  theme: 'light' | 'dark' | 'midnight'
  accent: string // hex
  wallpaper: 'aurora' | 'dots' | 'plain' | 'hearts'
  fontScale: number // 0.9 .. 1.2
  bubbleRadius: number // px
  enterToSend: boolean
  animations: boolean
  bigEmoji: boolean
  language: 'ru' | 'en'
  // privacy
  showLastSeen: boolean
  showReadReceipts: boolean
  ghostMode: boolean // hide online status
  whoCanMessage: 'everyone' | 'contacts'
  // notifications
  notifySound: boolean
  notifyPreview: boolean
  // cosmetics
  premium: boolean
  nameGradient: boolean
}

export interface Account {
  /** Sequential numeric id — "каким по счёту создан" */
  numId: number
  uid: string
  username: string
  name: string
  email: string
  bio: string
  emoji: string
  color: string
  status: string // mood / custom status
  verified: boolean
  isBot: boolean
  createdAt: number
  lastSeen: number
  settings: UserSettings
}

/** Public-facing directory entry (people, groups, channels, bots). */
export interface Directory {
  uid: string
  kind: EntityKind
  numId: number
  username: string
  name: string
  emoji: string
  color: string
  bio: string
  verified: boolean
  members?: number
  online?: boolean
}

export type ChatType = 'dm' | 'group' | 'channel' | 'bot' | 'saved'

export interface Chat {
  id: string
  type: ChatType
  title: string
  username?: string
  emoji: string
  color: string
  description?: string
  memberUids: string[]
  adminUids: string[]
  ownerUid?: string
  verified?: boolean
  memberCount?: number
  createdAt: number
  pinned?: boolean
  muted?: boolean
  folder?: string
}

export interface Reaction {
  emoji: string
  uids: string[]
}

export interface Poll {
  question: string
  options: { text: string; uids: string[] }[]
  multi: boolean
}

export interface Message {
  id: string
  chatId: string
  senderUid: string
  text: string
  ts: number
  editedTs?: number
  replyToId?: string
  forwardedFrom?: string
  reactions: Reaction[]
  pinned?: boolean
  system?: boolean
  deleted?: boolean
  readByUids: string[]
  ttl?: number // self-destruct seconds
  poll?: Poll
  sticker?: string
}

// ───────────────────────── Realtime events ─────────────────────────

export type RealtimeEvent =
  | { type: 'message'; message: Message }
  | { type: 'message:update'; message: Message }
  | { type: 'message:delete'; chatId: string; id: string }
  | { type: 'typing'; chatId: string; uid: string; name: string }
  | { type: 'presence'; uid: string; lastSeen: number; online: boolean }
  | { type: 'chat:update'; chat: Chat }
  | { type: 'read'; chatId: string; uid: string; upToTs: number }
  | { type: 'directory'; entry: Directory }
