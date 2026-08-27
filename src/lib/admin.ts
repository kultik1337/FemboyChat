// Тонкий типизированный слой над admin_* RPC.
// Все проверки прав дублируются на сервере (fc_is_admin()), клиент — только UI.
import { useStore } from '../store/useStore'

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  const backend = useStore.getState().backend
  if (!backend?.rpc) return null
  try {
    const raw = await backend.rpc(fn, args ?? {})
    return (raw as T) ?? null
  } catch {
    return null
  }
}

export interface AdminOverview {
  users: number
  bots: number
  new_users_7d: number
  online: number
  banned: number
  chats: number
  groups: number
  channels: number
  dms: number
  messages: number
  messages_24h: number
  messages_7d: number
  attachments: number
  reports_open: number
  top_chats: Array<{ id: string; title: string | null; type: string; messages: number }>
  daily: Array<{ day: string; messages: number }>
}

export interface AdminUser {
  uid: string
  username: string | null
  name: string | null
  num_id: number | null
  emoji: string | null
  color: string | null
  avatar_url: string | null
  email: string | null
  is_bot: boolean
  verified: boolean
  created_at: string | null
  last_seen: string | null
  banned_until: string | null
  ban_reason: string | null
  is_admin: boolean
  premium: boolean
  can_create_bots: boolean
  max_bots: number
  messages: number
}

export interface AdminChat {
  id: string
  type: string
  title: string | null
  username: string | null
  emoji: string | null
  color: string | null
  avatar_url: string | null
  is_private: boolean
  verified: boolean
  owner_uid: string | null
  member_count: number | null
  members_real: number
  created_at: string | null
  messages: number
  last_message_at: string | null
}

export interface AdminMessage {
  id: string
  chat_id: string
  chat_title: string | null
  sender_uid: string | null
  sender_username: string | null
  sender_name: string | null
  text: string | null
  ts: string | null
  deleted: boolean
  has_attachment: boolean
}

export type ReportStatus = 'open' | 'resolved' | 'dismissed'

export interface AdminReport {
  id: string
  target_type: 'user' | 'chat' | 'message'
  target_id: string
  reason: string
  note: string | null
  status: ReportStatus
  created_at: string
  reporter_uid: string
  reporter_username: string | null
  reporter_name: string | null
  resolved_at: string | null
  resolved_by: string | null
}

/* ── обзор ───────────────────────────────────────────────────────────────── */
export const adminOverview = () => call<AdminOverview>('admin_overview')

/* ── люди ────────────────────────────────────────────────────────────────── */
export const adminListUsers = (q?: string, lim = 60) =>
  call<AdminUser[]>('admin_list_users', { q: q?.trim() || null, lim })

export const adminSetVerified = (target: string, value: boolean) =>
  call<boolean>('admin_set_verified', { target, value })

export const adminBanUser = (target: string, days: number | null, reason: string | null) =>
  call<boolean>('admin_ban_user', { target, days, reason })

export const adminUnbanUser = (target: string) => call<boolean>('admin_unban_user', { target })

// Перки живут в user_perks и управляются существующими RPC.
export const adminSetPerk = (target: string, perk: string, value: boolean) =>
  call<boolean>('set_perk', { target, perk, value })

export const adminSetMaxBots = (target: string, value: number) =>
  call<boolean>('set_max_bots', { target, value })

/* ── чаты ────────────────────────────────────────────────────────────────── */
export const adminListChats = (q?: string, lim = 60) =>
  call<AdminChat[]>('admin_list_chats', { q: q?.trim() || null, lim })

export const adminSetChatVerified = (chat: string, value: boolean) =>
  call<boolean>('admin_set_chat_verified', { p_chat: chat, value })

export const adminDeleteChat = (chat: string) =>
  call<boolean>('admin_delete_chat', { p_chat: chat })

/* ── сообщения ───────────────────────────────────────────────────────────── */
export const adminSearchMessages = (q?: string, chat?: string | null, lim = 60) =>
  call<AdminMessage[]>('admin_search_messages', {
    q: q?.trim() || null,
    p_chat: chat || null,
    lim,
  })

export const adminDeleteMessage = (message: string, hard = false) =>
  call<boolean>('admin_delete_message', { p_message: message, hard })

/* ── жалобы ──────────────────────────────────────────────────────────────── */
export const adminListReports = (status: ReportStatus | 'all' = 'open', lim = 60) =>
  call<AdminReport[]>('admin_list_reports', { p_status: status, lim })

export const adminResolveReport = (report: string, status: ReportStatus) =>
  call<boolean>('admin_resolve_report', { p_report: report, p_status: status })

/* ── пользовательская жалоба (доступна всем авторизованным) ──────────────── */
export const reportContent = (
  targetType: 'user' | 'chat' | 'message',
  targetId: string,
  reason: string,
  note?: string,
) =>
  call<string>('report_content', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_note: note ?? null,
  })

/* ── утилиты форматирования ──────────────────────────────────────────────── */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

export function fmtNum(value: number | null | undefined): string {
  if (value == null) return '0'
  return new Intl.NumberFormat('ru-RU').format(value)
}

export function isBanned(user: Pick<AdminUser, 'banned_until'>): boolean {
  if (!user.banned_until) return false
  const t = new Date(user.banned_until).getTime()
  return Number.isNaN(t) ? true : t > Date.now()
}
