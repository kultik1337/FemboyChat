import type { Account, Chat, Directory, LinkPreview, Message, RealtimeEvent } from '../../types'
import { defaultSettings } from '../defaults'
import { normalizeUsername, uid as rid } from '../util'
import type { Backend, AuthResult, ChatPreview, MessagePage, PeerPresence } from './types'

/** Default number of messages loaded per chat page. */
const PAGE_SIZE = 50

/**
 * How many typing channels may stay joined at once. Typing is only ever shown
 * for the chat on screen, so a handful is plenty; the cap stops an account with
 * hundreds of conversations from opening a socket subscription for each one.
 */
const TYPING_CHANNEL_LIMIT = 12

/**
 * How many chats may have a live message subscription at once.
 *
 * Every joined chat gets one, because the sidebar has to light up for chats
 * that are not on screen. The cap keeps an account with hundreds of
 * conversations from opening hundreds of socket topics; the chat list arrives
 * newest-first, so the ones that get dropped are the least active.
 */
const MESSAGE_CHANNEL_LIMIT = 40

/** Buckets. Avatars stay public; everything people send each other does not. */
const AVATAR_BUCKET = 'avatars'
const ATTACHMENT_BUCKET = 'attachments'

/**
 * How long a signed attachment link stays valid. Long enough that an open tab
 * keeps working through a normal session, short enough that a leaked link is
 * not a permanent public door into someone's private chat.
 */
const SIGNED_URL_TTL_SEC = 60 * 60 * 24

/** Re-sign this long before expiry, so a link never dies mid-playback. */
const SIGN_REFRESH_MARGIN_MS = 10 * 60 * 1000

/**
 * Pull the storage object path out of an attachment URL pointing at our private
 * bucket.
 *
 * Returns null for anything else — external GIFs, blob: previews of a file that
 * has not been uploaded yet, data: URLs — so those are left completely alone.
 *
 * Both shapes are handled: the legacy `.../object/public/attachments/<path>`
 * links stored in old rows, and `.../object/sign/attachments/<path>?token=...`
 * written since the bucket became private. The query string is dropped, so a
 * long-expired token in the database is harmless: only the path matters.
 */
function attachmentObjectPath(url?: string): string | null {
  const marker = `/${ATTACHMENT_BUCKET}/`
  if (!url || !url.includes(marker)) return null
  const tail = url.split(marker).slice(1).join(marker)
  const path = (tail ?? '').split('?')[0]
  if (!path) return null
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

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
 * What arrives over the socket, and why, is written down in live-notes.md.
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
  /** Posts already reported to mark_viewed, so scrolling doesn't re-send them. */
  private viewed = new Set<string>()
  /** Joined typing channels, keyed by chat id. Insertion order = age. */
  private typingChannels = new Map<string, any>()
  /** Joined message channels, keyed by chat id. Insertion order = age. */
  private messageChannels = new Map<string, any>()
  /** Signed attachment links, keyed by storage path, with their expiry. */
  private signedUrls = new Map<string, { url: string; exp: number }>()
  /** Profile lookups in flight, so a burst of messages asks only once. */
  private pendingLookups = new Set<string>()

  constructor(private url: string, private key: string) {}

  async init() {
    const { createClient } = await import('@supabase/supabase-js')
    this.client = createClient(this.url, this.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    // Preload the public directory so @-name resolution works immediately
    // (otherwise peers render as "someone" until something refreshes it).
    try {
      const { data } = await this.client.from('directory').select('*')
      this.directoryCache = (data ?? []).map(rowToDirectory)
    } catch {
      /* best effort */
    }

    // Messages are NOT subscribed to globally. One unfiltered subscription on
    // public.messages asks the server to evaluate this account's RLS policies
    // against every single message written anywhere in the service — that is
    // the first thing to hit a free-tier limit, and it grows with other
    // people's traffic rather than with our own. Subscriptions are opened per
    // chat instead, in watchMessages(), from the chat list and from opening a
    // conversation.

    // Chats are just as live as messages. Someone leaving a group, a new member
    // joining, a renamed channel or a fresh avatar all rewrite this row — and
    // without listening for it the only way to notice was reloading the page.
    //
    // This one stays global on purpose: the table is small, it changes rarely,
    // and it is what tells us about a brand-new conversation whose message
    // channel does not exist yet.
    this.client
      .channel('fc-chats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, (p: any) => {
        const row = p.new && Object.keys(p.new).length > 0 ? p.new : p.old
        if (!row?.id) return
        const chat = rowToChat(row)
        this.subs.forEach((cb) => cb({ type: 'chat:update', chat } as RealtimeEvent))
      })
      .subscribe()
  }

  // ── message subscriptions ──

  /**
   * Join (or reuse) the realtime channel carrying one chat's messages.
   *
   * The server-side filter is the whole point: without it the socket delivers
   * a policy check for every message in the database.
   *
   * Comments on channel posts are stored in this very table, distinguished only
   * by comment_of. They must never reach the feed subscribers: a comment is not
   * a chat message, and letting one through would both render it as a
   * standalone post and pop a notification for it.
   */
  private watchMessages(chatId: string) {
    if (!this.client || !chatId) return
    const existing = this.messageChannels.get(chatId)
    if (existing) return existing

    const filter = `chat_id=eq.${chatId}`
    const channel = this.client
      .channel(`fc-msg-${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (p: any) => {
        if (p.new?.comment_of) return
        void this.emitMessage('message', rowToMessage(p.new))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (p: any) => {
        if (p.new?.comment_of) return
        void this.emitMessage('message:update', rowToMessage(p.new))
      })
      .subscribe()

    this.messageChannels.set(chatId, channel)
    // Map iteration order is insertion order, so the first key is the oldest.
    while (this.messageChannels.size > MESSAGE_CHANNEL_LIMIT) {
      const oldest = this.messageChannels.keys().next().value as string | undefined
      if (!oldest || oldest === chatId) break
      this.unwatchMessages(oldest)
    }
    return channel
  }

  private unwatchMessages(chatId: string) {
    const channel = this.messageChannels.get(chatId)
    if (!channel) return
    this.messageChannels.delete(chatId)
    try {
      this.client?.removeChannel(channel)
    } catch {
      /* the socket may already be gone */
    }
  }

  /**
   * Bring the set of joined message channels in line with the chat list: join
   * the new ones, and leave the chats this account is no longer part of. The
   * second half matters — being removed from a group used to leave its channel
   * open until the tab was closed.
   */
  private syncMessageChannels(chats: Chat[]) {
    const wanted = new Set(chats.map((c) => c.id))
    for (const id of [...this.messageChannels.keys()]) {
      if (!wanted.has(id)) this.unwatchMessages(id)
    }
    for (const c of chats) this.watchMessages(c.id)
  }

  private dropMessageChannels() {
    for (const chatId of [...this.messageChannels.keys()]) this.unwatchMessages(chatId)
  }

  /**
   * Fan a message out to subscribers, giving its attachment a usable link
   * first. An arriving row carries whatever URL was stored months ago, which
   * for a private bucket is not something the browser can load.
   *
   * The sender is looked up at the same time: someone who registered after this
   * tab loaded is missing from the directory, and the bubble would otherwise be
   * signed "someone" until a reload. That lookup is deliberately not awaited —
   * the message must not wait for a name.
   */
  private async emitMessage(type: 'message' | 'message:update', message: Message) {
    void this.ensureKnown(message.senderUid)
    const ready = await this.withSignedAttachment(message)
    this.subs.forEach((cb) => cb({ type, message: ready } as RealtimeEvent))
  }

  /**
   * Make sure a uid has a name, an avatar and a @nick before the interface has
   * to draw it. Known people cost nothing, and one uid is never asked for twice
   * at the same time.
   */
  private async ensureKnown(uid: string) {
    if (!uid || !this.client) return
    if (uid === this.account?.uid) return
    if (this.directoryCache.some((d) => d.uid === uid)) return
    if (this.pendingLookups.has(uid)) return
    this.pendingLookups.add(uid)
    try {
      const { data } = await this.client.from('directory').select('*').eq('uid', uid).maybeSingle()
      if (!data) return
      const entry = rowToDirectory(data)
      this.directoryCache = [entry, ...this.directoryCache.filter((d) => d.uid !== entry.uid)]
      this.subs.forEach((cb) => cb({ type: 'directory', entry } as RealtimeEvent))
    } catch {
      /* a name is not worth an error — the previous one stays */
    } finally {
      this.pendingLookups.delete(uid)
    }
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

  /**
   * Find the signed-in user's profile row, creating it on first sight.
   *
   * New sign-ups normally get their row from a database trigger; this is the
   * fallback for accounts created before that trigger existed.
   *
   * Two unique constraints can reject the insert, and the retry loop used to
   * treat both as "nick taken": a clash on the e-mail (an orphaned profile
   * still holding it) therefore looped twice, failed twice, and returned null,
   * which then blew up in rowToAccount as "Cannot read properties of null
   * (reading 'num_id')" and froze the whole boot. Each constraint now gets the
   * fix it actually needs, and an insert that still fails throws something a
   * human can read instead of a null.
   */
  private async ensureProfile(user: any, username?: string, name?: string): Promise<Account> {
    const { data: existing } = await this.client.from('profiles').select('*').eq('uid', user.id).maybeSingle()
    if (existing) return rowToAccount(existing)
    let uname = normalizeUsername(username || user.user_metadata?.username || `user${Date.now().toString(36)}`)
    let email: string | null = user.email ?? null
    const base = {
      uid: user.id,
      name: name || user.user_metadata?.name || uname,
      bio: '',
      emoji: '🎀',
      color: '#ff7ab8',
      status: '',
      verified: false,
      is_bot: false,
      settings: defaultSettings(),
    }
    let inserted: any = null
    let lastError: any = null
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const { data, error } = await this.client.from('profiles').insert({ ...base, email, username: uname }).select('*').single()
      if (data) {
        inserted = data
        break
      }
      lastError = error
      const detail = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
      const conflict = error?.code === '23505' || detail.includes('duplicate')
      if (!conflict) break
      // The e-mail is optional in the profile; the account itself already owns
      // it in auth.users, so dropping it here is harmless and unblocks login.
      if (detail.includes('email')) email = null
      else uname = `${uname}_${Math.random().toString(36).slice(2, 5)}`
    }
    if (!inserted) {
      throw new Error(
        lastError?.message
          ? `Не удалось создать профиль: ${lastError.message}`
          : 'Не удалось создать профиль — попробуй перезагрузить страницу',
      )
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
    this.dropTypingChannels()
    this.dropMessageChannels()
    // Signed links are tied to the session that asked for them; a different
    // account must never inherit them from the previous one.
    this.signedUrls.clear()
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
    const chats = (data ?? []).map(rowToChat)
    // Joining happens here because this is the one place that knows the full
    // chat list. Broadcast is send-only until a client joins the channel, which
    // is exactly why the indicator never used to appear.
    this.watchTyping(chats)
    // Same reason for messages: this is where we learn which chats deserve a
    // filtered subscription, and which ones no longer do.
    this.syncMessageChannels(chats)
    // Everyone the user shares a private chat with must have a name ready
    // before the sidebar draws them.
    for (const c of chats) {
      if (c.type !== 'dm' && c.type !== 'bot') continue
      for (const u of c.memberUids) void this.ensureKnown(u)
    }
    return chats
  }

  /**
   * One RPC returns the last message of every chat. This replaces the old
   * "call listMessages() for each chat" loop, which downloaded the entire
   * history of the whole account every time a single message arrived.
   *
   * The RPC itself ignores comment rows, so a comment can never show up as a
   * chat's last message in the sidebar.
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
    this.unwatchTyping(id)
    this.unwatchMessages(id)
  }

  /**
   * Newest page first by default. Pass { before } to walk further back.
   * The result is always returned oldest-first so the UI can append directly.
   *
   * Only top-level messages are returned. Comments on channel posts live in the
   * same table and are fetched separately by the comment view.
   */
  async listMessages(chatId: string, page?: MessagePage): Promise<Message[]> {
    // Opening a conversation is the other moment a live subscription is needed:
    // a chat joined through an invite link is on screen before the refreshed
    // chat list comes back.
    this.watchMessages(chatId)
    let q = this.client
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .is('comment_of', null)
      .order('ts', { ascending: false })
      .limit(page?.limit ?? PAGE_SIZE)
    if (page?.before) q = q.lt('ts', new Date(page.before).toISOString())
    const { data } = await q
    const messages = (data ?? []).map(rowToMessage)
    // A history page can easily contain people who joined after this tab did.
    for (const uid of new Set(messages.map((m: Message) => m.senderUid))) void this.ensureKnown(uid as string)
    // One signing request covers every attachment on the page.
    return this.withSignedAttachments(messages.reverse())
  }
  async send(input: Omit<Message, 'id' | 'ts' | 'reactions' | 'readByUids'>): Promise<Message> {
    const { data } = await this.client
      .from('messages')
      .insert({
        chat_id: input.chatId,
        sender_uid: input.senderUid,
        text: input.text,
        reply_to_id: input.replyToId,
        // The exact fragment the author highlighted before replying. Null for
        // an ordinary reply, which quotes the whole message by definition.
        quote: input.quote ?? null,
        sticker: input.sticker,
        poll: input.poll,
        ttl: input.ttl,
        attachment: input.attachment,
        comment_of: input.commentOf ?? null,
        // Set only when forwarding; an ordinary message leaves it null.
        forwarded_from: input.forwardedFrom ?? null,
      })
      .select('*')
      .single()
    return this.withSignedAttachment(rowToMessage(data))
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

  /**
   * Generic server-function call. Deliberately forgiving: every current caller
   * (view counters, presence, account deletion) prefers a quiet `null` over an
   * exception bubbling into the UI.
   */
  async rpc(fn: string, args?: Record<string, unknown>): Promise<unknown | null> {
    if (!this.client) return null
    try {
      const { data, error } = await this.client.rpc(fn, args ?? {})
      if (error) return null
      return data ?? null
    } catch {
      return null
    }
  }

  /** Real online state, filtered server-side by each user's privacy setting. */
  async peerPresence(uids: string[]): Promise<PeerPresence[]> {
    if (uids.length === 0) return []
    const data = (await this.rpc('peer_presence', { uids })) as any[] | null
    return (data ?? []).map((r) => ({
      uid: r.uid,
      online: !!r.online,
      lastSeen: r.last_seen ? Date.parse(r.last_seen) : undefined,
    }))
  }

  /** Count a channel post as seen. Each id is only ever reported once. */
  async markViewed(messageIds: string[]) {
    const fresh = messageIds.filter((id) => id && !this.viewed.has(id))
    if (fresh.length === 0) return
    fresh.forEach((id) => this.viewed.add(id))
    await this.rpc('mark_viewed', { msg_ids: fresh })
  }

  /** Comments under a single channel post, oldest first. */
  async listComments(postId: string): Promise<Message[]> {
    const { data } = await this.client
      .from('messages')
      .select('*')
      .eq('comment_of', postId)
      .order('ts', { ascending: true })
    const messages = (data ?? []).map(rowToMessage)
    for (const uid of new Set(messages.map((m: Message) => m.senderUid))) void this.ensureKnown(uid as string)
    return this.withSignedAttachments(messages)
  }

  // ── attachment links ──

  /**
   * Turn storage paths into signed links, using the in-memory cache for
   * anything still comfortably valid and asking storage for the rest in a
   * single batched request.
   *
   * Failures are quiet on purpose: a missing link degrades one thumbnail, and
   * that is far better than an exception taking the whole chat down.
   */
  private async signPaths(paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (!this.client) return out
    const now = Date.now()
    const missing: string[] = []
    for (const path of paths) {
      const hit = this.signedUrls.get(path)
      if (hit && hit.exp - SIGN_REFRESH_MARGIN_MS > now) out.set(path, hit.url)
      else missing.push(path)
    }
    if (missing.length === 0) return out
    try {
      const { data, error } = await this.client.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrls(missing, SIGNED_URL_TTL_SEC)
      if (error || !data) return out
      for (const row of data as any[]) {
        const signed: string | undefined = row?.signedUrl ?? row?.signedURL
        const path: string | undefined = row?.path
        if (!signed || !path) continue
        this.signedUrls.set(path, { url: signed, exp: now + SIGNED_URL_TTL_SEC * 1000 })
        out.set(path, signed)
      }
    } catch {
      /* offline or storage hiccup — keep whatever the cache had */
    }
    return out
  }

  /** Swap stored attachment URLs for freshly signed ones. */
  private async withSignedAttachments(messages: Message[]): Promise<Message[]> {
    const paths = new Set<string>()
    for (const m of messages) {
      const path = attachmentObjectPath(m.attachment?.url)
      if (path) paths.add(path)
    }
    if (paths.size === 0) return messages
    const signed = await this.signPaths([...paths])
    if (signed.size === 0) return messages
    return messages.map((m) => {
      if (!m.attachment) return m
      const path = attachmentObjectPath(m.attachment.url)
      const url = path ? signed.get(path) : undefined
      return url ? { ...m, attachment: { ...m.attachment, url } } : m
    })
  }

  private async withSignedAttachment(message: Message): Promise<Message> {
    const [signed] = await this.withSignedAttachments([message])
    return signed ?? message
  }

  async uploadFile(kind: 'avatar' | 'attachment', file: Blob, name?: string): Promise<{ url: string }> {
    if (!this.account) throw new Error('not authed')
    const bucket = kind === 'avatar' ? AVATAR_BUCKET : ATTACHMENT_BUCKET
    const { extensionFor } = await import('../media')
    // ASCII only: a signed link is issued for an exact object path, so a name
    // that survives a percent-encoding round trip is one less thing to break.
    const safeBase = (name ?? 'file')
      .replace(/\.[^.]*$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'file'
    const path = `${this.account.uid}/${Date.now()}-${safeBase}.${extensionFor(file.type, name)}`
    const { error } = await this.client.storage.from(bucket).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) throw new Error(error.message ?? 'Не удалось загрузить файл')
    // Avatars are meant to be visible everywhere, including to people who share
    // no chat with you, so that bucket stays public.
    if (bucket === AVATAR_BUCKET) {
      const { data } = this.client.storage.from(bucket).getPublicUrl(path)
      return { url: data.publicUrl as string }
    }
    const signed = await this.signPaths([path])
    const url = signed.get(path)
    if (!url) throw new Error('Файл загрузился, но ссылку получить не удалось — попробуй ещё раз')
    return { url }
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

  // ── typing ──

  /**
   * Join the typing channels of the conversations where an indicator is
   * actually rendered. Channels are only ever shown for people, so groups,
   * direct chats and bots qualify while broadcast channels do not.
   */
  private watchTyping(chats: Chat[]) {
    if (!this.client) return
    for (const c of chats) {
      if (c.type !== 'dm' && c.type !== 'group' && c.type !== 'bot') continue
      this.typingChannel(c.id)
    }
  }

  /**
   * Get (or join) the broadcast channel carrying typing pings for one chat.
   *
   * `self: false` keeps our own pings from bouncing back, and the uid guard
   * covers the case of the same account being open in two tabs.
   */
  private typingChannel(chatId: string) {
    const existing = this.typingChannels.get(chatId)
    if (existing) return existing

    const channel = this.client.channel(`typing-${chatId}`, { config: { broadcast: { self: false } } })
    channel
      .on('broadcast', { event: 'typing' }, (p: any) => {
        const uid = p?.payload?.uid
        if (!uid || uid === this.account?.uid) return
        void this.ensureKnown(uid)
        this.subs.forEach((cb) =>
          cb({ type: 'typing', chatId: p?.payload?.chatId ?? chatId, uid, name: p?.payload?.name ?? '' }),
        )
      })
      .subscribe()

    this.typingChannels.set(chatId, channel)
    // Map iteration order is insertion order, so the first key is the oldest.
    while (this.typingChannels.size > TYPING_CHANNEL_LIMIT) {
      const oldest = this.typingChannels.keys().next().value as string | undefined
      if (!oldest || oldest === chatId) break
      this.unwatchTyping(oldest)
    }
    return channel
  }

  private unwatchTyping(chatId: string) {
    const channel = this.typingChannels.get(chatId)
    if (!channel) return
    this.typingChannels.delete(chatId)
    try {
      this.client?.removeChannel(channel)
    } catch {
      /* the socket may already be gone */
    }
  }

  private dropTypingChannels() {
    for (const chatId of [...this.typingChannels.keys()]) this.unwatchTyping(chatId)
  }

  setTyping(chatId: string) {
    if (!this.client || !this.account) return
    // Reuses the joined channel; joining on demand also covers a chat that was
    // opened before its list arrived.
    this.typingChannel(chatId).send({
      type: 'broadcast',
      event: 'typing',
      payload: { uid: this.account.uid, name: this.account.name, chatId },
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
    // The view only exposes last_seen for users who allow everyone to see it.
    lastSeen: r.last_seen ? Date.parse(r.last_seen) : undefined,
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
    quote: r.quote ?? undefined,
    forwardedFrom: r.forwarded_from ?? undefined,
    reactions: r.reactions ?? [],
    pinned: r.pinned,
    deleted: r.deleted,
    readByUids: r.read_by_uids ?? [],
    ttl: r.ttl ?? undefined,
    poll: r.poll ?? undefined,
    sticker: r.sticker ?? undefined,
    attachment: r.attachment ?? undefined,
    commentOf: r.comment_of ?? undefined,
    viewCount: r.view_count ?? undefined,
    commentCount: r.comment_count ?? undefined,
    streaming: r.streaming ? true : undefined,
  }
}
