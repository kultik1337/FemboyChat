// ────────────────────── Domain types ──────────────────────

export type EntityKind = 'user' | 'group' | 'channel' | 'bot'

/** Who may see a given piece of profile activity. */
export type Audience = 'everyone' | 'contacts' | 'nobody'

/**
 * Every palette the app ships with. `auto` follows the operating system and
 * resolves to `light` or `dark`.
 *
 * The names are stored in each account's settings, so a value may only ever be
 * ADDED to this union — renaming one would leave existing accounts pointing at
 * a theme that no longer exists.
 */
export type ThemeName =
  | 'light'
  | 'dark'
  | 'midnight'
  | 'graphite'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'lavender'
  | 'auto'

/** Chat backgrounds. Same append-only rule as themes. */
export type WallpaperName =
  | 'aurora'
  | 'dots'
  | 'plain'
  | 'hearts'
  | 'mesh'
  | 'grid'
  | 'waves'
  | 'stars'
  | 'glow'

export interface UserSettings {
  theme: ThemeName
  accent: string // hex
  wallpaper: WallpaperName
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
  /**
   * Server-enforced privacy. `public.directory` and `peer_presence()` read
   * `settings #>> '{privacy,lastSeen}'` directly, so this is the value that
   * actually hides presence from other people — the booleans above only
   * affect local rendering.
   */
  privacy?: {
    lastSeen: Audience
  }
  // notifications
  notifySound: boolean
  notifyPreview: boolean
  // cosmetics
  premium: boolean
  nameGradient: boolean
  emoticons: boolean // auto-convert :) <3 :3 → emoji on send
  sendSound: boolean // soft pop when you send
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
  avatarUrl?: string // custom uploaded avatar (overrides emoji)
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
  avatarUrl?: string
  bio: string
  verified: boolean
  members?: number
  online?: boolean
  /** Only present when the person allows everyone to see it. */
  lastSeen?: number
}

export type ChatType = 'dm' | 'group' | 'channel' | 'bot' | 'saved'

export interface Chat {
  id: string
  type: ChatType
  title: string
  username?: string
  emoji: string
  color: string
  avatarUrl?: string // custom uploaded chat photo
  isPrivate?: boolean // private communities are invite-only and hidden from search
  inviteCode?: string // join code for invite links (visible to members)
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

export type AttachmentKind = 'image' | 'gif' | 'video' | 'audio' | 'voice' | 'file'

/** A media payload attached to a message (photo, video, file, voice note, GIF…). */
export interface Attachment {
  kind: AttachmentKind
  url: string
  name?: string
  size?: number // bytes
  mime?: string
  w?: number
  h?: number
  durationSec?: number // for audio / voice / video
  spoiler?: boolean // media hidden behind a blur until tapped
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
  /**
   * The exact fragment of the replied-to message the author highlighted before
   * hitting reply. Empty when the whole message was quoted.
   */
  quote?: string
  reactions: Reaction[]
  pinned?: boolean
  system?: boolean
  deleted?: boolean
  readByUids: string[]
  ttl?: number // self-destruct seconds
  poll?: Poll
  sticker?: string
  attachment?: Attachment
  /**
   * Set on a comment: the id of the channel post it belongs to. Comments live
   * in the same `messages` table as everything else, so any list of a chat's
   * messages must filter them out — otherwise they show up as ordinary posts.
   */
  commentOf?: string
  /** Channel posts only: how many people have seen this post. */
  viewCount?: number
  /** Channel posts only: how many comments hang off this post. */
  commentCount?: number
  /**
   * Local-only: this bubble was inserted optimistically and the server has not
   * confirmed the write yet. Never sent to or returned by a backend.
   */
  pending?: boolean
  /** Local-only: the write failed, so the bubble stays and is marked unsent. */
  failed?: boolean
  /**
   * A bot reply that is still being generated token-by-token. The row is
   * inserted empty and grows via `message:update` events until the model is
   * done, at which point the flag is cleared. Drives the live "typing" caret.
   */
  streaming?: boolean
}

/** Open Graph preview of a link inside a message. */
export interface LinkPreview {
  title: string
  description: string
  image: string
  siteName: string
}

// ────────────────────── Realtime events ──────────────────────

export type RealtimeEvent =
  | { type: 'message'; message: Message }
  | { type: 'message:update'; message: Message }
  | { type: 'message:delete'; chatId: string; id: string }
  | { type: 'typing'; chatId: string; uid: string; name: string }
  | { type: 'presence'; uid: string; lastSeen: number; online: boolean }
  | { type: 'chat:update'; chat: Chat }
  | { type: 'read'; chatId: string; uid: string; upToTs: number }
  | { type: 'directory'; entry: Directory }
