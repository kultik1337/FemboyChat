import type { Account, Chat, Directory, Message, RealtimeEvent } from '../../types'

export interface RequestCodeResult {
  ok: boolean
  isNew: boolean
  devCode?: string // only returned in local/demo mode
  error?: string
}

export interface VerifyResult {
  ok: boolean
  account?: Account
  error?: string
}

export interface Backend {
  readonly mode: 'local' | 'supabase'
  init(): Promise<void>

  // auth (passwordless, email code)
  requestCode(email: string, username?: string, name?: string): Promise<RequestCodeResult>
  verifyCode(email: string, code: string): Promise<VerifyResult>
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
  updateChat(id: string, patch: Partial<Chat>): Promise<Chat>
  leaveChat(id: string): Promise<void>

  // messages
  listMessages(chatId: string): Promise<Message[]>
  send(input: Omit<Message, 'id' | 'ts' | 'reactions' | 'readByUids'>): Promise<Message>
  edit(chatId: string, id: string, text: string): Promise<void>
  remove(chatId: string, id: string): Promise<void>
  react(chatId: string, id: string, emoji: string): Promise<void>
  markRead(chatId: string): Promise<void>
  votePoll(chatId: string, id: string, optionIndex: number): Promise<void>
  pin(chatId: string, id: string): Promise<void>

  // presence / typing
  setTyping(chatId: string): void
  setPresence(online: boolean): void

  // realtime
  subscribe(cb: (e: RealtimeEvent) => void): () => void
}
