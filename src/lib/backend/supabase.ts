import type { Account, Chat, Directory, LinkPreview, Message, RealtimeEvent } from '../../types'
import { defaultSettings } from '../defaults'
import { normalizeUsername, uid as rid } from '../util'
import type { Backend, AuthResult, ChatPreview, MessagePage } from './types'

/** Default number of messages loaded per chat page. */
const PAGE_SIZE = 50

/**
 * Optional production backend backed by Supabase.
 *
 * It is only selected when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set.
 *
 * Auth is e-mail + password. Users register with a real e-mail, a @username and
 * a password; Supabase (with the project's custom SMTP) sends a confirmation
 * e-mail, and after confirming they can log in from any device. Realtime
 * message streams come from Supabase.
 *
 * The SQL schema this expects lives in supabase/schema.sql.
 */
export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const
  private client: any
  private subs = new Set<(e: RealtimeEvent) => void>()
  private account: Account | null = null
  private directoryCache: Directory[] = []
  private lastPresenceAt = 0

  constructor(private url: string, private key: string) {}

  async init() {
    const { createClient } = await import('@supabase/supabase-js')
    this.client = createClient(this.url, this.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    // Preload the public directory so @-name resolution works immediately
    // (otherwise peers render as "Кто-то" until something refreshes it).
    try {
      const { data } = await this.client.from('directory').select('*')
      this.directoryCache = (data ?? []).map(rowToDirectory)
    } catch {
      /* best effort */
    }
    // Global realtime: any new message row fans out to subscribers.
    // RLS applies to the replication stream too, so this only delivers rows
    // from chats the signed-in user is actually a member of.
    this.client
      .channel('fc-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p: any) =>
        this.subs.forEach((cb) => cb({ type: 'message', message: rowToMessage(p.new) })),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p: any) =>
        this.subs.forEach((cb) => cb({ type: 'message:update', message: rowToMessage(p.new) })),
      )
      .subscribe()
  }

  private async refreshDirectory() {
    try {
      const { data } = await this.client.from('directory').select('*')
      this.directoryCache = (data ?? []).map(rowToDirectory)
    } catch {
      /* best effort */
    }
  }

  // Register with e-mail + @username + password. If e-mail confirmation is on,
  // no session is returned yet — the caller shows a "check your inbox" screen.
  async register(email: string, username: string, name: string, password: string): Promise<AuthResult> {
    const uname = normalizeUsername(username ?? '')
    const mail = (email ?? '').trim().toLowerCase()
    if (!mail || !mail.includes('@')) return { ok: false, error: 'Введите корректный e-mail' }
    if (!uname || uname.length < 3) return { ok: false, error: 'Ник — минимум 3 символа (a-z, 0-9, _)' }
    if (!password || password.length < 6) return { ok: false, error: 'Пароль — минимум 6 символов' }
    // The profiles table is not readable by anonymous clients any more, so the
    // nick check goes through a security-definer RPC that only answers yes/no.
    const { data: available, error: unameError } = await this.client.rpc('username_available', { uname })
    if (!unameError && available === false) return { ok: false, error: 'Этот ник уже занят, выбери другой 🥺' }

    const { data, error } = await this.client.auth.signUp({
      email: mail,
      password,
      options: {
        data: { username: uname, name: name ?? '' },
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })
    if (error) {
      const m = (error.message ?? '').toLowerCase()
      if (m.includes('registered') || m.includes('already'))
        return { ok: false, error: 'На эту почту уже есть аккаунт — попробуй войти' }
      return { ok: false, error: error.message }
    }
    if (!data?.session) {
      // Confirmation is required: a letter was sent.
      return { ok: false, pendingConfirm: true }
    }
    this.account = await this.ensureProfile(data.user, uname, name)
    await this.refreshDirectory()
    return { ok: true, account: this.account }
  }

  // Log in with e-mail + password.
  async login(email: string, password: string): Promise<AuthResult> {
    const mail = (email ?? '').trim().toLowerCase()
    if (!mail) return { ok: false, error: 'Введите e-mail' }
    const { data, error } = await this.client.auth.signInWithPassword({ email: mail, password })
    if (error) {
      const m = (error.message ?? '').toLowerCase()
      if (m.includes('confirm')) return { ok: false, error: 'Сначала подтверди почту — мы прислали письмо ✉️' }
      return { ok: false, error: 'Неверный e-mail или пароль 🥺' }
    }
    if (!data?.user) return { ok: false, error: 'Неверный e-mail или пароль 🥺' }
    this.account = await this.ensureProfile(data.user, data.user.user_metadata?.username, data.user.user_metadata?.name)
    await this.refreshDirectory()
    return { ok: true, account: this.account }
  }

  private async ensureProfile(user: any, username?: string, name?: string): Promise<Account> {
    const { data: existing } = await this.client.from('profiles').select('*').eq('uid', user.id).maybeSingle()
    if (existing) return rowToAccount(existing)
    let uname = normalizeUsername(username || user.user_metadata?.username || `user${Date.now().toString(36)}`)
    const base = {
      uid: user.id,
      name: name || user.user_metadata?.name || uname,
      email: user.email ?? null,
      bio: '',
      emoji: '🎀',
      color: '#ff7ab8',
      status: '',
      verified: false,
      is_bot: false,
      settings: defaultSettings(),
    }
    let inserted: any = null
    for (let attempt = 0; attempt < 2 && !inserted; attempt++) {
      const { data, error } = await this.client.from('profiles').insert({ ...base, username: uname }).select('*').single()
      if (data) inserted = data
      else if (error && (error.code === '23505' || (error.message ?? '').includes('duplicate')))
        uname = `${uname}_${Math.random().toString(36).slice(2, 5)}` // nick taken: append a short suffix
      else break
    }
    return rowToAccount(inserted)
  }

  async restore(): Promise<Account | null> {
    const { data } = await this.client.auth.getUser()
    if (!data?.user) return null
    // Create the profile on the first authenticated load (e.g. right after the
    // e-mail confirmation link brings the user back with a fresh session).
    this.account = await this.ensureProfile(data.user, data.user.user_metadata?.username, data.user.user_metadata?.name)
    await this.refreshDirectory()
    return this.account
  }

  async logout() {
    await this.client.auth.signOut()
    this.account = null
  }

  async updateAccount(patch: Partial<Account>): Promise<Account> {
    if (!this.account) throw new Error('not authed')
    const merged = { ...this.account, ...patch, settings: { ...this.account.settings, ...(patch.settings ?? {}) } }
    await this.client
      .from('profiles')
      .update({
        name: merged.name,
        username: merged.username,
        bio: merged.bio,
        emoji: merged.emoji,
        color: merged.color,
        avatar_url: merged.avatarUrl ?? null,
        status: merged.status,
        settings: merged.settings,
      })
      .eq('uid', merged.uid)
    this.account = merged
    return merged
  }

  getDirectoryList(): Directory[] {
    // best-effort refresh for consumers that call synchronously
    this.client
      ?.from('directory')
      .select('*')
      .then(({ data }: any) => (this.directoryCache = (data ?? []).map(rowToDirectory)))
    return this.directoryCache
  }
  searchDirectory(q: string): Directory[] {
    const query = q.trim().toLowerCase().replace(/^@/, '')
    const list = this.directoryCache.filter((d) => d.uid !== this.account?.uid)
    if (!query) return list.slice(0, 20)
    return list.filter(
      (d) => d.username.toLowerCase().includes(query) || d.name.toLowerCase().includes(query) || String(d.numId) === query,
    )
  }

  async listChats(): Promise<Chat[]> {
    const { data } = await this.client.rpc('list_my_chats')
    return (data ?? []).map(rowToChat)
  }

  /**
   * One RPC returns the last message of every chat. This replaces the old
   * "call listMessages() for each chat" loop, which downloaded the entire
   * history of the whole account every time a single message arrived.
   */
  async listChatPreviews(): Promise<ChatPreview[]> {
    const { data, error } = await this.client.rpc('chat_previews')
    if (error) return []
    return (data ?? []).map((r: any) => ({
      chatId: r.chat_id,
      text: r.text ?? '',
      ts: typeof r.ts === 'number' ? r.ts : Date.parse(r.ts),
      senderUid: r.sender_uid,
      sticker: r.sticker ?? undefined,
      attachment: r.attachment ?? undefined,
      deleted: r.deleted ?? undefined,
    }))
  }

  getChat(): Chat | undefined {
    return undefined
  }
  async createChat(input: any): Promise<Chat> {
    const { data } = await this.client.from('chats').insert({
      id: (input.type === 'channel' ? 'chan-' : 'grp-') + rid().slice(0, 8),
      type: input.type,
      title: input.title,
      username: input.username ? normalizeUsername(input.username) : null,
      emoji: input.emoji,
      description: input.description,
      owner_uid: this.account?.uid,
    }).select('*').single()
    return rowToChat(data)
  }
  async openDM(otherUid: string): Promise<Chat> {
    const { data } = await this.client.rpc('open_dm', { other: otherUid })
    return rowToChat(data)
  }
  async joinEntity(entityUid: string): Promise<Chat> {
    const { data, error } = await this.client.rpc('join_entity', { entity: entityUid })
    if (error) throw new Error(error.message ?? 'Не удалось открыть чат')
    return rowToChat(data)
  }
  async joinByInvite(code: string): Promise<Chat> {
    const { data, error } = await this.client.rpc('join_by_invite', { code })
    if (error) throw new Error(error.message ?? 'Приглашение недействительно')
    return rowToChat(data)
  }
  async updateChat(id: string, patch: Partial<Chat>): Promise<Chat> {
    // pin/mute is per-user and lives in chat_prefs — route it through the
    // security-definer RPC so one member's pin no longer pins for everyone.
    const keys = Object.keys(patch)
    if (keys.length > 0 && keys.every((k) => k === 'pinned' || k === 'muted')) {
      const { data, error } = await this.client.rpc('set_chat_flags', {
        chat: id,
        want_pinned: patch.pinned ?? null,
        want_muted: patch.muted ?? null,
      })
      if (error) throw new Error(error.message ?? 'Не удалось обновить чат')
      return rowToChat(data)
    }
    // Map camelCase Chat fields onto snake_case columns; only editable ones.
    const row: Record<string, unknown> = {}
    if (patch.title !== undefined) row.title = patch.title
    if (patch.description !== undefined) row.description = patch.description
    if (patch.emoji !== undefined) row.emoji = patch.emoji
    if (patch.color !== undefined) row.color = patch.color
    if (patch.username !== undefined) row.username = patch.username || null
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl ?? null
    if (patch.isPrivate !== undefined) row.is_private = patch.isPrivate
    if (patch.inviteCode !== undefined) row.invite_code = patch.inviteCode ?? null
    if (patch.memberUids !== undefined) { row.member_uids = patch.memberUids; row.member_count = patch.memberUids.length }
    if (patch.adminUids !== undefined) row.admin_uids = patch.adminUids
    const { data, error } = await this.client.from('chats').update(row).eq('id', id).select('*').single()
    if (error) throw new Error(error.message ?? 'Не удалось обновить чат')
    return rowToChat(data)
  }
  async leaveChat(id: string) {
    await this.client.rpc('leave_chat', { chat: id })
  }

  /**
   * Newest page first by default. Pass { before } to walk further back.
   * The result is always returned oldest-first so the UI can append directly.
   */
  async listMessages(chatId: string, page?: MessagePage): Promise<Message[]> {
    let q = this.client
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('ts', { ascending: false })
      .limit(page?.limit ?? PAGE_SIZE)
    if (page?.before) q = q.lt('ts', new Date(page.before).toISOString())
    const { data } = await q
    return (data ?? []).map(rowToMessage).reverse()
  }
  async send(input: Omit<Message, 'id' | 'ts' | 'reactions' | 'readByUids'>): Promise<Message> {
    const { data } = await this.client
      .from('messages')
      .insert({
        chat_id: input.chatId,
        sender_uid: input.senderUid,
        text: input.text,
        reply_to_id: input.replyToId,
        sticker: input.sticker,
        poll: input.poll,
        ttl: input.ttl,
        attachment: input.attachment,
      })
      .select('*')
      .single()
    return rowToMessage(data)
  }
  async edit(_c: string, id: string, text: string) {
    await this.client.from('messages').update({ text, edited_ts: Date.now() }).eq('id', id)
  }
  async remove(_c: string, id: string) {
    await this.client.from('messages').update({ deleted: true, text: '' }).eq('id', id)
  }
  async react(_c: string, id: string, emoji: string) {
    await this.client.rpc('toggle_reaction', { message: id, emoji })
  }
  async votePoll(_c: string, id: string, optionIndex: number) {
    await this.client.rpc('vote_poll', { message: id, option_index: optionIndex })
  }
  async pin(_c: string, id: string) {
    await this.client.rpc('toggle_pin', { message: id })
  }
  async markRead(chatId: string) {
    await this.client.rpc('mark_read', { chat: chatId })
  }

  async uploadFile(kind: 'avatar' | 'attachment', file: Blob, name?: string): Promise<{ url: string }> {
    if (!this.account) throw new Error('not authed')
    const bucket = kind === 'avatar' ? 'avatars' : 'attachments'
    const { extensionFor } = await import('../media')
    const safeBase = (name ?? 'file')
      .replace(/\.[^.]*$/, '')
      .replace(/[^a-zA-Z0-9а-яёА-ЯЁ_-]+/g, '_')
      .slice(0, 40) || 'file'
    const path = `${this.account.uid}/${Date.now()}-${safeBase}.${extensionFor(file.type, name)}`
    const { error } = await this.client.storage.from(bucket).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) throw new Error(error.message ?? 'Не удалось загрузить файл')
    const { data } = this.client.storage.from(bucket).getPublicUrl(path)
    return { url: data.publicUrl as string }
  }

  async fetchLinkPreview(url: string): Promise<LinkPreview | null> {
    try {
      const { data, error } = await this.client.functions.invoke('link-preview', { body: { url } })
      if (error || !data?.preview) return null
      return data.preview as LinkPreview
    } catch {
      return null
    }
  }

  setTyping(chatId: string) {
    this.client?.channel(`typing-${chatId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { uid: this.account?.uid, name: this.account?.name, chatId },
    })
  }

  /**
   * Heartbeat: refresh last_seen so the directory's `online` flag
   * (last_seen > now() - 5 min) stops reporting everyone as offline forever.
   * Throttled to at most one write per 30s.
   */
  setPresence(online: boolean) {
    if (!online || !this.account || !this.client) return
    const now = Date.now()
    if (now - this.lastPresenceAt < 30_000) return
    this.lastPresenceAt = now
    this.client
      .from('profiles')
      .update({ last_seen: new Date(now).toISOString() })
      .eq('uid', this.account.uid)
      .then(() => {}, () => {})
  }

  subscribe(cb: (e: RealtimeEvent) => void) {
    this.subs.add(cb)
    return () => this.subs.delete(cb)
  }
}

// ── row mappers ──
function rowToAccount(r: any): Account {
  return {
    numId: r.num_id ?? 0,
    uid: r.uid,
    username: r.username,
    name: r.name,
    email: r.email,
    bio: r.bio ?? '',
    emoji: r.emoji ?? '🎀',
    color: r.color ?? '#ff7ab8',
    avatarUrl: r.avatar_url ?? undefined,
    status: r.status ?? '',
    verified: !!r.verified,
    isBot: !!r.is_bot,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    lastSeen: r.last_seen ? Date.parse(r.last_seen) : Date.now(),
    settings: r.settings ?? defaultSettings(),
  }
}
function rowToDirectory(r: any): Directory {
  return {
    uid: r.uid,
    kind: r.kind,
    numId: r.num_id ?? 0,
    username: r.username ?? '',
    name: r.name,
    emoji: r.emoji ?? '💬',
    color: r.color ?? '#ff7ab8',
    avatarUrl: r.avatar_url ?? undefined,
    bio: r.bio ?? '',
    verified: !!r.verified,
    members: r.members,
    online: r.online,
  }
}
function rowToChat(r: any): Chat {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    username: r.username ?? undefined,
    emoji: r.emoji ?? '💬',
    color: r.color ?? '#ff7ab8',
    avatarUrl: r.avatar_url ?? undefined,
    isPrivate: r.is_private ?? undefined,
    inviteCode: r.invite_code ?? undefined,
    description: r.description ?? undefined,
    memberUids: r.member_uids ?? [],
    adminUids: r.admin_uids ?? [],
    ownerUid: r.owner_uid ?? undefined,
    verified: !!r.verified,
    memberCount: r.member_count ?? undefined,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    pinned: r.pinned,
    muted: r.muted,
  }
}
function rowToMessage(r: any): Message {
  return {
    id: r.id,
    chatId: r.chat_id,
    senderUid: r.sender_uid,
    text: r.text ?? '',
    ts: typeof r.ts === 'number' ? r.ts : Date.parse(r.ts ?? r.created_at ?? Date.now()),
    editedTs: r.edited_ts ?? undefined,
    replyToId: r.reply_to_id ?? undefined,
    reactions: r.reactions ?? [],
    pinned: r.pinned,
    deleted: r.deleted,
    readByUids: r.read_by_uids ?? [],
    ttl: r.ttl ?? undefined,
    poll: r.poll ?? undefined,
    sticker: r.sticker ?? undefined,
    attachment: r.attachment ?? undefined,
  }
}
