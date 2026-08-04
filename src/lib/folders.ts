import type { Chat } from '../types'

/**
 * Свои папки чатов.
 *
 * Хранятся рядом с черновиками — в localStorage этого устройства, под ключом
 * аккаунта. Папки — это способ смотреть на свой список чатов, а не общие
 * данные: никто другой их не видит и на сервере от них ничего не зависит,
 * поэтому таблица в базе была бы лишним запросом на каждом запуске. В
 * интерфейсе это честно подписано.
 */
export type ChatFolder = {
  id: string
  name: string
  emoji: string
  chatIds: string[]
}

const PREFIX = 'fc:folders:'

/** Событие, по которому боковая панель перечитывает папки. */
export const FOLDER_EVENT = 'fc:folders'

export const FOLDER_EMOJI = ['📁', '⭐', '💜', '🎀', '🔥', '🎧', '💼', '🌸', '🐾', '🎮']

export const MAX_FOLDERS = 12

/** Никогда не доверяем форме того, что лежит в localStorage. */
export function loadFolders(uid: string): ChatFolder[] {
  try {
    const raw = localStorage.getItem(PREFIX + uid)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: ChatFolder[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      if (typeof row.id !== 'string' || typeof row.name !== 'string') continue
      out.push({
        id: row.id,
        name: row.name,
        emoji: typeof row.emoji === 'string' && row.emoji ? row.emoji : '📁',
        chatIds: Array.isArray(row.chatIds) ? row.chatIds.filter((x): x is string => typeof x === 'string') : [],
      })
    }
    return out.slice(0, MAX_FOLDERS)
  } catch {
    return []
  }
}

export function saveFolders(uid: string, folders: ChatFolder[]) {
  try {
    localStorage.setItem(PREFIX + uid, JSON.stringify(folders.slice(0, MAX_FOLDERS)))
  } catch {
    // Переполненное хранилище не повод ронять интерфейс.
  }
  window.dispatchEvent(new CustomEvent(FOLDER_EVENT))
}

export function newFolderId() {
  return 'f-' + Math.random().toString(36).slice(2, 9)
}

/** Чаты папки в том же порядке, в котором их уже отсортировал стор. */
export function chatsInFolder(chats: Chat[], folder: ChatFolder) {
  return chats.filter((c) => folder.chatIds.includes(c.id))
}
