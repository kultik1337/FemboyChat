import type { Account, Attachment, Chat, Directory, LinkPreview, Message, RealtimeEvent } from '../../types'

export interface AuthResult {
  ok: boolean
  account?: Account
  error?: string
  pendingConfirm?: boolean // sign-up succeeded but the e-mail must be confirmed first
}

/** Last message of a chat, used to render the sidebar without loading history. */
export interface ChatPreview {
  chatId: string
  text: string
  ts: number
  senderUid: string
  sticker?: string
  attachment?: Attachment
  deleted?: boolean
}

/** Paging window for listMessages(). Omitted = newest page. */
export interface MessagePage {
  /** Only return messages older than this timestamp (ms). */
  before?: number
  /** How many messages to fetch. Defaults to 50. */
  limit?: number
}

export interface Backend {
  readonly mode: 'local' | 'supabase'
  init(): Promise<void>

  // auth (e-mail + password; sign-up may require e-mail confirmation)
  register(email: string, username: string, name: string, password: string): Promise<AuthResult>
  login(email: string, password: string): Promise<AuthResult>
  restore(): Promise<Account | null>
  logout(): Promise<void>
  updateAccount(patch: Partial<Account>): Promise<Account>

  // directory / search
  getDirectoryList(): Directory[]
  searchDirectory(q: string): Directory[]

  // chats
  listChats(): Promise<Chat[]>
  getChat(id: string): Chat | undefined
  createChat(input: {
    type: 'group' | 'channel'
    title: string
    description?: string
    emoji: string
    username?: string
    memberUids?: string[]
  }): Promise<Chat>
  openDM(otherUid: string): Promise<Chat>
  joinEntity(entityUid: string): Promise<Chat>
  joinByInvite(code: string): Promise<Chat>
  updateChat(id: string, patch: Partial<Chat>): Promise<Chat>
  leaveChat(id: string): Promise<void>

  /**
   * Optional fast path: the last message of every chat in a single round-trip.
   * Backends that can't do this (LocalBackend) simply omit it and the store
   * falls back to per-chat loading.
   */
  listChatPreviews?(): Promise<ChatPreview[]>

  // messages
  listMessages(chatId: string, page?: MessagePage): Promise<Message[]>
  send(input: Omit<Message, 'id' | 'ts' | 'reactions' | 'readByUids'>): Promise<Message>
  edit(chatId: string, id: string, text: string): Promise<void>
  remove(chatId: string, id: string): Promise<void>
  react(chatId: string, id: string, emoji: string): Promise<void>
  markRead(chatId: string): Promise<void>
  votePoll(chatId: string, id: string, optionIndex: number): Promise<void>
  pin(chatId: string, id: string): Promise<void>

  // media uploads (avatars + message attachments)
  uploadFile(kind: 'avatar' | 'attachment', file: Blob, name?: string): Promise<{ url: string }>

  // link previews (og:-tags, fetched server-side; null in demo mode)
  fetchLinkPreview(url: string): Promise<LinkPreview | null>

  // presence / typing
  setTyping(chatId: string): void
  setPresence(online: boolean): void

  // realtime
  subscribe(cb: (e: RealtimeEvent) => void): () => void
}
