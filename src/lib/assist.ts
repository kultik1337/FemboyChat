import { useStore } from '../store/useStore'

/**
 * ИИ-помощник по переписке.
 *
 * Модели спрашивает сервер (edge-функция `fc-assist`), потому что ключи
 * провайдеров живут в Vault и браузеру их видеть нельзя. Вместо токена
 * сессии наружу уходит одноразовый тикет на две минуты: его выдаёт база и
 * только тому, кто реально состоит в этом чате.
 */

/** Адрес собирается из частей: цельные литеральные URL в исходнике уже ломались. */
const PROJECT_REF = 'azriyxvofeceosuoptcm'

function endpoint(): string {
  const configured = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || ''
  const base = configured || 'https' + '://' + PROJECT_REF + '.supabase' + '.co'
  return base.replace(/\/$/, '') + '/functions/v1/fc-assist'
}

async function ticketFor(chatId: string): Promise<string> {
  const backend = useStore.getState().backend
  const token = await backend?.rpc?.('assist_ticket', { p_chat: chatId })
  if (typeof token !== 'string' || !token) {
    throw new Error('Помощник работает только в облачном режиме')
  }
  return token
}

type AssistResponse = { text?: string; replies?: string[]; unread?: number; error?: string }

async function call(chatId: string, mode: 'summary' | 'replies' | 'ask', question?: string): Promise<AssistResponse> {
  const ticket = await ticketFor(chatId)
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticket, mode, question }),
  })
  let data: AssistResponse = {}
  try {
    data = (await res.json()) as AssistResponse
  } catch {
    throw new Error('Помощник не ответил')
  }
  if (!res.ok || data.error) throw new Error(data.error || 'Помощник не ответил')
  return data
}

/** Короткий пересказ непрочитанного (или хвоста переписки, если непрочитанного нет). */
export async function summariseUnread(chatId: string): Promise<{ text: string; unread: number }> {
  const data = await call(chatId, 'summary')
  return { text: data.text ?? '', unread: data.unread ?? 0 }
}

/** Три варианта ответа на последние сообщения. */
export async function suggestReplies(chatId: string): Promise<string[]> {
  const data = await call(chatId, 'replies')
  return Array.isArray(data.replies) ? data.replies : []
}

/** Свободный вопрос по содержанию чата. */
export async function askAboutChat(chatId: string, question: string): Promise<string> {
  const data = await call(chatId, 'ask', question)
  return data.text ?? ''
}
