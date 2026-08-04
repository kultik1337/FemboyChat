/**
 * Отложенная отправка — клиентская сторона.
 *
 * Вся механика живёт на сервере (таблица scheduled_messages плюс задание
 * по расписанию, которое раз в минуту перекладывает созревшие заготовки
 * в messages). Клиент только ставит задачу и показывает список: таймер в
 * браузере умирает вместе с вкладкой, а смысл в том, чтобы сообщение
 * ушло, когда автор спит.
 *
 * Всё идёт через узкий ход `backend.rpc` — именно для таких случаев он и
 * существует. Благодаря этому слой бэкендов остаётся нетронутым, а в
 * демо-режиме (LocalBackend, без сервера) механика честно отвечает
 * «недоступно», а не делает вид, что сообщение поставлено в очередь.
 */

import { getBackend } from './backend'

export interface ScheduledMessage {
  id: string
  chatId: string
  text: string
  sticker?: string
  /** Когда уйдёт, в миллисекундах. */
  sendAt: number
  ttl?: number
  /** Заполняется сервером, если отправить так и не удалось. */
  error?: string
}

type Row = Record<string, unknown>

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function toScheduled(row: Row): ScheduledMessage {
  return {
    id: String(row.id),
    chatId: String(row.chat_id),
    text: typeof row.text === 'string' ? row.text : '',
    sticker: str(row.sticker),
    sendAt: new Date(String(row.send_at)).getTime(),
    ttl: typeof row.ttl === 'number' ? row.ttl : undefined,
    error: str(row.error),
  }
}

/**
 * Есть ли сервер, способный доставить сообщение без открытой вкладки.
 * Интерфейс спрашивает об этом заранее, чтобы не предлагать то, чего нет.
 */
export async function isScheduleAvailable(): Promise<boolean> {
  const backend = await getBackend()
  return typeof backend.rpc === 'function'
}

/** Свои ещё не ушедшие заготовки, ближайшие сначала. */
export async function listScheduled(): Promise<ScheduledMessage[]> {
  const backend = await getBackend()
  const rows = await backend.rpc?.('my_scheduled_messages')
  if (!Array.isArray(rows)) return []
  return (rows as Row[]).map(toScheduled)
}

export interface ScheduleInput {
  chatId: string
  text: string
  /** Когда отправить, в миллисекундах. */
  sendAt: number
  sticker?: string
  replyToId?: string
  ttl?: number
}

/**
 * Поставить сообщение в очередь. `null` означает отказ: сервер проверяет
 * и право писать в чат, и время (не в прошлое, не дальше года), и лимит
 * заготовок. Текст причины до клиента не доходит — `rpc` глушит ошибки,
 * поэтому интерфейс не должен выдумывать конкретную причину за сервер.
 */
export async function scheduleMessage(input: ScheduleInput): Promise<ScheduledMessage | null> {
  const backend = await getBackend()
  if (typeof backend.rpc !== 'function') return null
  const res = await backend.rpc('schedule_message', {
    p_chat_id: input.chatId,
    p_send_at: new Date(input.sendAt).toISOString(),
    p_text: input.text,
    p_sticker: input.sticker ?? null,
    p_reply_to_id: input.replyToId ?? null,
    p_ttl: input.ttl ?? null,
  })
  if (!res || typeof res !== 'object') return null
  // Функция возвращает строку таблицы; PostgREST отдаёт её объектом,
  // но на всякий случай принимаем и массив из одной строки.
  const row = Array.isArray(res) ? (res[0] as Row | undefined) : (res as Row)
  if (!row || row.id === undefined) return null
  return toScheduled(row)
}

/** Отменить можно только до отправки; после это обычное сообщение. */
export async function cancelScheduled(id: string): Promise<boolean> {
  const backend = await getBackend()
  const res = await backend.rpc?.('cancel_scheduled_message', { p_id: id })
  return res === true
}
