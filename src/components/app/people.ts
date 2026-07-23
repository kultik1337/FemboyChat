import { useStore } from '../../store/useStore'
import type { Chat, Directory } from '../../types'

export interface Person {
  uid: string
  name: string
  emoji: string
  color: string
  username: string
  verified: boolean
  isBot: boolean
  numId: number
}

/** Resolve a uid to a display identity from the directory or the current account. */
export function usePeople() {
  const directory = useStore((s) => s.directory)
  const account = useStore((s) => s.account)
  const presence = useStore((s) => s.presence)

  function resolve(uid: string): Person {
    if (account && uid === account.uid)
      return {
        uid,
        name: account.name,
        emoji: account.emoji,
        color: account.color,
        username: account.username,
        verified: account.verified,
        isBot: false,
        numId: account.numId,
      }
    const d = directory.find((x) => x.uid === uid)
    if (d)
      return { uid, name: d.name, emoji: d.emoji, color: d.color, username: d.username, verified: d.verified, isBot: d.kind === 'bot', numId: d.numId }
    return { uid, name: 'Кто-то', emoji: '💬', color: '#ff7ab8', username: '', verified: false, isBot: false, numId: 0 }
  }

  function isOnline(uid: string, fallback?: Directory) {
    const p = presence[uid]
    if (p) return p.online
    return fallback?.online ?? false
  }

  return { resolve, isOnline }
}

export function chatCounterpart(chat: Chat, myUid?: string) {
  if (chat.type === 'dm' || chat.type === 'bot') return chat.memberUids.find((u) => u !== myUid)
  return undefined
}
