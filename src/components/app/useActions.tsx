import { Ban, Bell, BellOff, Copy, CornerUpLeft, Download, Forward, Hash, Info, LogOut, MessageCircle, Pencil, Pin, Trash2, UserRound } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useBlocks, setBlocked } from '../../lib/blocks'
import { usePeople } from './people'
import { openForward } from './ForwardPicker'
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
  const blocked = useBlocks()

  const copy = (text: string, note = '\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e') => {
    navigator.clipboard?.writeText(text)
    toast(note, '\ud83d\udccb')
  }

  async function ensureDm(uid: string) {
    const chat = await useStore.getState().backend!.openDM(uid)
    await refreshChats()
    return chat
  }

  function chatMenu(chat: Chat): MenuItem[] {
    const backend = useStore.getState().backend!
    const items: MenuItem[] = [
      { label: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c', icon: <MessageCircle size={15} />, onClick: () => openChat(chat.id) },
      {
        label: chat.pinned ? '\u041e\u0442\u043a\u0440\u0435\u043f\u0438\u0442\u044c' : '\u0417\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c',
        icon: <Pin size={15} />,
        checked: chat.pinned,
        onClick: async () => { await backend.updateChat(chat.id, { pinned: !chat.pinned }); refreshChats() },
      },
      {
        label: chat.muted ? '\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f' : '\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f',
        icon: chat.muted ? <Bell size={15} /> : <BellOff size={15} />,
        onClick: async () => { await backend.updateChat(chat.id, { muted: !chat.muted }); refreshChats() },
      },
      {
        label: '\u041e\u0442\u043c\u0435\u0442\u0438\u0442\u044c \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043d\u044b\u043c',
        icon: <Info size={15} />,
        onClick: async () => { await backend.markRead(chat.id); useStore.setState((s) => ({ unread: { ...s.unread, [chat.id]: 0 } })) },
      },
    ]
    if (chat.type !== 'saved') {
      items.push({ kind: 'divider' })
      items.push({
        label: chat.type === 'channel' ? '\u041e\u0442\u043f\u0438\u0441\u0430\u0442\u044c\u0441\u044f' : chat.type === 'group' ? '\u041f\u043e\u043a\u0438\u043d\u0443\u0442\u044c \u0433\u0440\u0443\u043f\u043f\u0443' : '\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0447\u0430\u0442',
        icon: <LogOut size={15} />,
        danger: true,
        onClick: async () => {
          await backend.leaveChat(chat.id)
          await refreshChats()
          if (useStore.getState().activeChatId === chat.id) openChat('')
          toast('\u0413\u043e\u0442\u043e\u0432\u043e')
        },
      })
    }
    return items
  }

  function personMenu(uid: string): MenuItem[] {
    const p = resolve(uid)
    const backend = useStore.getState().backend!
    // A blocked bot is simply a bot whose replies the server now refuses to
    // insert, which is exactly what "stop the bot" is supposed to mean.
    const isBlocked = blocked.has(uid)
    return [
      { label: '\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435', icon: <MessageCircle size={15} />, onClick: () => startPerson(uid) },
      { label: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c', icon: <UserRound size={15} />, onClick: () => setProfileUid(uid) },
      {
        label: '\u0417\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0447\u0430\u0442',
        icon: <Pin size={15} />,
        onClick: async () => { const c = await ensureDm(uid); await backend.updateChat(c.id, { pinned: !c.pinned }); refreshChats() },
      },
      {
        label: '\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f',
        icon: <BellOff size={15} />,
        onClick: async () => { const c = await ensureDm(uid); await backend.updateChat(c.id, { muted: !c.muted }); refreshChats() },
      },
      { kind: 'divider' },
      { label: '\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c @username', icon: <Copy size={15} />, onClick: () => copy('@' + p.username) },
      ...(p.numId ? [{ label: `\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c ID (#${p.numId})`, icon: <Hash size={15} />, onClick: () => copy('#' + p.numId) } as MenuItem] : []),
      { kind: 'divider' },
      {
        label: isBlocked
          ? (p.isBot ? '\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0431\u043e\u0442\u0430' : '\u0420\u0430\u0437\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u0442\u044c')
          : (p.isBot ? '\u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0431\u043e\u0442\u0430' : '\u0417\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u0442\u044c'),
        icon: <Ban size={15} />,
        danger: !isBlocked,
        onClick: async () => {
          const ok = await setBlocked(uid, !isBlocked)
          if (!ok) return toast('\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0442\u043e\u043b\u044c\u043a\u043e \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043e\u043c', '\ud83d\udeab')
          toast(
            isBlocked
              ? (p.isBot ? '\u0411\u043e\u0442 \u0441\u043d\u043e\u0432\u0430 \u043e\u0442\u0432\u0435\u0447\u0430\u0435\u0442' : '\u0420\u0430\u0437\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d')
              : (p.isBot ? '\u0411\u043e\u0442 \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d' : '\u0417\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d'),
            isBlocked ? '\u2705' : '\ud83d\udeab',
          )
        },
      },
    ]
  }

  function startPerson(uid: string) {
    const dir = useStore.getState().directory.find((d) => d.uid === uid)
    startWith(dir ?? ({ uid, kind: 'user' } as any))
  }

  async function forwardToSaved(m: Message) {
    const st = useStore.getState()
    const saved = st.chats.find((c) => c.type === 'saved')
    if (!saved || !st.account) return toast('\u0418\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e', '\ud83d\udd16')
    await st.backend!.send({
      chatId: saved.id,
      senderUid: st.account.uid,
      text: m.text,
      sticker: m.sticker,
      attachment: m.attachment,
      poll: m.poll,
      // Forwarding a forward still credits whoever actually wrote it.
      forwardedFrom: m.forwardedFrom ?? m.senderUid,
    })
    if (st.activeChatId === saved.id) await openChat(saved.id)
    toast('\u041f\u0435\u0440\u0435\u0441\u043b\u0430\u043d\u043e \u0432 \u0418\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435', '\ud83d\udd16')
  }

  function messageMenu(m: Message): { items: MenuItem[]; reactions: { onPick: (e: string) => void } } {
    const me = useStore.getState().account
    const mine = m.senderUid === me?.uid
    const items: MenuItem[] = [
      { label: '\u041e\u0442\u0432\u0435\u0442\u0438\u0442\u044c', icon: <CornerUpLeft size={15} />, onClick: () => setComposeReply(m) },
      { label: '\u041f\u0435\u0440\u0435\u0441\u043b\u0430\u0442\u044c\u2026', icon: <Forward size={15} />, onClick: () => openForward(m) },
      { label: '\u0412 \u0418\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435', icon: <Forward size={15} />, onClick: () => forwardToSaved(m) },
      { label: '\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c', icon: <Copy size={15} />, onClick: () => copy(m.sticker ?? m.text) },
      { label: m.pinned ? '\u041e\u0442\u043a\u0440\u0435\u043f\u0438\u0442\u044c' : '\u0417\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c', icon: <Pin size={15} />, checked: m.pinned, onClick: () => pin(m.id) },
    ]
    if (m.attachment) {
      items.push({
        label: '\u0421\u043a\u0430\u0447\u0430\u0442\u044c \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435',
        icon: <Download size={15} />,
        onClick: () => {
          const a = document.createElement('a')
          a.href = m.attachment!.url
          a.download = m.attachment!.name ?? 'file'
          a.target = '_blank'
          a.rel = 'noreferrer noopener'
          a.click()
        },
      })
    }
    if (mine && !m.poll && !m.sticker) items.push({ label: '\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c', icon: <Pencil size={15} />, onClick: () => setComposeEdit(m) })
    if (mine) {
      items.push({ kind: 'divider' })
      items.push({ label: '\u0423\u0434\u0430\u043b\u0438\u0442\u044c', icon: <Trash2 size={15} />, danger: true, onClick: () => removeMsg(m.id) })
    }
    return { items, reactions: { onPick: (e) => react(m.id, e) } }
  }

  return { chatMenu, personMenu, messageMenu, setRightPanel }
}
