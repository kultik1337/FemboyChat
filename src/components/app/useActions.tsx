import { Ban, Bell, BellOff, Copy, CornerUpLeft, Hash, Info, LogOut, MessageCircle, Pencil, Pin, Trash2, UserRound } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { usePeople } from './people'
import type { MenuItem } from '../ui/ContextMenu'
import type { Chat, Message } from '../../types'

/** Builders for the floating context menus (chats, people/bots, messages). */
export function useActions() {
  const { resolve } = usePeople()
  const startWith = useStore((s) => s.startWith)
  const setComposeReply = useStore((s) => s.setComposeReply)
  const setComposeEdit = useStore((s) => s.setComposeEdit)
  const react = useStore((s) => s.react)
  const pin = useStore((s) => s.pin)
  const removeMsg = useStore((s) => s.remove)
  const refreshChats = useStore((s) => s.refreshChats)
  const openChat = useStore((s) => s.openChat)
  const toast = useStore((s) => s.toast)
  const setProfileUid = useStore((s) => s.setProfileUid)
  const setRightPanel = useStore((s) => s.setRightPanel)

  const copy = (text: string, note = 'Скопировано') => {
    navigator.clipboard?.writeText(text)
    toast(note, '📋')
  }

  async function ensureDm(uid: string) {
    const chat = await useStore.getState().backend!.openDM(uid)
    await refreshChats()
    return chat
  }

  function chatMenu(chat: Chat): MenuItem[] {
    const backend = useStore.getState().backend!
    const items: MenuItem[] = [
      { label: 'Открыть', icon: <MessageCircle size={15} />, onClick: () => openChat(chat.id) },
      {
        label: chat.pinned ? 'Открепить' : 'Закрепить',
        icon: <Pin size={15} />,
        checked: chat.pinned,
        onClick: async () => { await backend.updateChat(chat.id, { pinned: !chat.pinned }); refreshChats() },
      },
      {
        label: chat.muted ? 'Включить уведомления' : 'Выключить уведомления',
        icon: chat.muted ? <Bell size={15} /> : <BellOff size={15} />,
        onClick: async () => { await backend.updateChat(chat.id, { muted: !chat.muted }); refreshChats() },
      },
      {
        label: 'Отметить прочитанным',
        icon: <Info size={15} />,
        onClick: async () => { await backend.markRead(chat.id); useStore.setState((s) => ({ unread: { ...s.unread, [chat.id]: 0 } })) },
      },
    ]
    if (chat.type !== 'saved') {
      items.push({ kind: 'divider' })
      items.push({
        label: chat.type === 'channel' ? 'Отписаться' : chat.type === 'group' ? 'Покинуть группу' : 'Удалить чат',
        icon: <LogOut size={15} />,
        danger: true,
        onClick: async () => {
          await backend.leaveChat(chat.id)
          await refreshChats()
          if (useStore.getState().activeChatId === chat.id) openChat('')
          toast('Готово')
        },
      })
    }
    return items
  }

  function personMenu(uid: string): MenuItem[] {
    const p = resolve(uid)
    const backend = useStore.getState().backend!
    return [
      { label: 'Написать сообщение', icon: <MessageCircle size={15} />, onClick: () => startPerson(uid) },
      { label: 'Открыть профиль', icon: <UserRound size={15} />, onClick: () => setProfileUid(uid) },
      {
        label: 'Закрепить чат',
        icon: <Pin size={15} />,
        onClick: async () => { const c = await ensureDm(uid); await backend.updateChat(c.id, { pinned: !c.pinned }); refreshChats() },
      },
      {
        label: 'Выключить уведомления',
        icon: <BellOff size={15} />,
        onClick: async () => { const c = await ensureDm(uid); await backend.updateChat(c.id, { muted: !c.muted }); refreshChats() },
      },
      { kind: 'divider' },
      { label: 'Копировать @username', icon: <Copy size={15} />, onClick: () => copy('@' + p.username) },
      ...(p.numId ? [{ label: `Копировать ID (#${p.numId})`, icon: <Hash size={15} />, onClick: () => copy('#' + p.numId) } as MenuItem] : []),
      { kind: 'divider' },
      { label: p.isBot ? 'Остановить бота' : 'Заблокировать', icon: <Ban size={15} />, danger: true, onClick: () => toast(p.isBot ? 'Бот остановлен (демо)' : 'Пользователь заблокирован (демо)', '🚫') },
    ]
  }

  function startPerson(uid: string) {
    const dir = useStore.getState().directory.find((d) => d.uid === uid)
    startWith(dir ?? ({ uid, kind: 'user' } as any))
  }

  function messageMenu(m: Message): { items: MenuItem[]; reactions: { onPick: (e: string) => void } } {
    const me = useStore.getState().account
    const mine = m.senderUid === me?.uid
    const items: MenuItem[] = [
      { label: 'Ответить', icon: <CornerUpLeft size={15} />, onClick: () => setComposeReply(m) },
      { label: 'Копировать', icon: <Copy size={15} />, onClick: () => copy(m.sticker ?? m.text) },
      { label: m.pinned ? 'Открепить' : 'Закрепить', icon: <Pin size={15} />, checked: m.pinned, onClick: () => pin(m.id) },
    ]
    if (mine && !m.poll && !m.sticker) items.push({ label: 'Изменить', icon: <Pencil size={15} />, onClick: () => setComposeEdit(m) })
    if (mine) {
      items.push({ kind: 'divider' })
      items.push({ label: 'Удалить', icon: <Trash2 size={15} />, danger: true, onClick: () => removeMsg(m.id) })
    }
    return { items, reactions: { onPick: (e) => react(m.id, e) } }
  }

  return { chatMenu, personMenu, messageMenu, setRightPanel }
}
