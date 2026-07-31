import { useState } from 'react'
import { Ban, Bell, BellOff, Copy, LogOut, MessageCircle, Pencil, Pin, Shield, ShieldOff, UserMinus, UserPlus, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { Verified } from '../ui/Verified'
import { chatCounterpart, usePeople } from './people'
import { useActions } from './useActions'
import { openContextMenu, type MenuItem } from '../ui/ContextMenu'
import { classNames, lastSeenLabel } from '../../lib/util'
import { GroupEditModal } from './GroupEditModal'

export function RightPanel() {
  const open = useStore((s) => s.rightPanelOpen)
  const profileUid = useStore((s) => s.profileUid)
  const account = useStore((s) => s.account)!
  const chats = useStore((s) => s.chats)
  const activeChatId = useStore((s) => s.activeChatId)
  const presence = useStore((s) => s.presence)
  const directory = useStore((s) => s.directory)
  const setRightPanel = useStore((s) => s.setRightPanel)
  const setProfileUid = useStore((s) => s.setProfileUid)
  const startWith = useStore((s) => s.startWith)
  const updateChatState = useStore((s) => s.backend)
  const refreshChats = useStore((s) => s.refreshChats)
  const openChat = useStore((s) => s.openChat)
  const toast = useStore((s) => s.toast)
  const { resolve } = usePeople()
  const { personMenu } = useActions()
  const [editOpen, setEditOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addQuery, setAddQuery] = useState('')

  if (!open) return null
  const close = () => { setRightPanel(false); setProfileUid(null) }
  const chat = chats.find((c) => c.id === activeChatId) ?? null

  // profile mode (a specific user/bot)
  const showProfile = profileUid ?? (chat && (chat.type === 'dm' || chat.type === 'bot') ? chatCounterpart(chat, account.uid) : null)

  async function mute() {
    if (!chat || !updateChatState) return
    await updateChatState.updateChat(chat.id, { muted: !chat.muted })
    await refreshChats()
  }
  async function pinChat() {
    if (!chat || !updateChatState) return
    await updateChatState.updateChat(chat.id, { pinned: !chat.pinned })
    await refreshChats()
  }
  const isAdmin = !!chat && (chat.adminUids.includes(account.uid) || chat.ownerUid === account.uid)
  const inviteLink = chat?.inviteCode ? `${location.origin}/#join=${chat.inviteCode}` : ''

  async function makeInvite() {
    if (!chat || !updateChatState) return
    try {
      const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      await updateChatState.updateChat(chat.id, { inviteCode: code })
      await refreshChats()
      await navigator.clipboard.writeText(`${location.origin}/#join=${code}`).catch(() => {})
      toast('Инвайт-ссылка создана и скопирована', '💌')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось', '⚠️')
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteLink).then(
      () => toast('Инвайт-ссылка скопирована', '📋'),
      () => toast('Не удалось скопировать', '⚠️'),
    )
  }

  async function addMember(uid: string) {
    if (!chat || !updateChatState) return
    try {
      await updateChatState.updateChat(chat.id, { memberUids: [...chat.memberUids, uid] })
      await refreshChats()
      toast('Участник добавлен', '➕')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось добавить', '⚠️')
    }
  }

  async function removeMember(uid: string) {
    if (!chat || !updateChatState) return
    try {
      await updateChatState.updateChat(chat.id, {
        memberUids: chat.memberUids.filter((u) => u !== uid),
        adminUids: chat.adminUids.filter((u) => u !== uid),
      })
      await refreshChats()
      toast('Участник удалён из группы', '👋')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось удалить', '⚠️')
    }
  }

  async function toggleAdmin(uid: string) {
    if (!chat || !updateChatState) return
    const on = chat.adminUids.includes(uid)
    try {
      await updateChatState.updateChat(chat.id, {
        adminUids: on ? chat.adminUids.filter((u) => u !== uid) : [...chat.adminUids, uid],
      })
      await refreshChats()
      toast(on ? 'Права админа сняты' : 'Назначен админом', '🛡️')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось', '⚠️')
    }
  }

  function memberMenu(uid: string): MenuItem[] {
    const base = personMenu(uid)
    if (!isAdmin || !chat || uid === account.uid || uid === chat.ownerUid) return base
    const isUidAdmin = chat.adminUids.includes(uid)
    return [
      ...base,
      { kind: 'divider' },
      {
        label: isUidAdmin ? 'Снять админа' : 'Назначить админом',
        icon: isUidAdmin ? <ShieldOff size={15} /> : <Shield size={15} />,
        onClick: () => toggleAdmin(uid),
      },
      { label: 'Удалить из группы', icon: <UserMinus size={15} />, danger: true, onClick: () => removeMember(uid) },
    ]
  }

  async function leave() {
    if (!chat || !updateChatState) return
    await updateChatState.leaveChat(chat.id)
    await refreshChats()
    openChat('')
    close()
    toast('Вы покинули чат')
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onMouseDown={close}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="fancy-scroll relative h-full w-full max-w-sm overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] shadow-2xl animate-slide-up" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-bold">{showProfile ? 'Профиль' : 'Информация'}</h3>
          <button onClick={close} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--panel-hover)]"><X size={18} /></button>
        </div>

        {showProfile ? (
          <ProfileBody uid={showProfile} onMessage={() => { const d = directory.find((x) => x.uid === showProfile) ?? { uid: showProfile } as any; startWith(d); close() }} />
        ) : chat ? (
          <div className="px-5 pb-8">
            <div className="flex flex-col items-center text-center">
              <Avatar emoji={chat.emoji} color={chat.color} src={chat.avatarUrl} size={92} />
              <div className="mt-3 flex items-center gap-1.5 text-xl font-black">{chat.title} {chat.verified && <Verified size={19} />}</div>
              {chat.username && <div className="text-sm text-[var(--muted)]">@{chat.username}</div>}
              <div className="mt-1 text-sm text-[var(--muted)]">
                {chat.type === 'channel' ? `${(chat.memberCount ?? 0).toLocaleString('ru-RU')} подписчиков` : `${chat.memberCount ?? chat.memberUids.length} участников`}
              </div>
            </div>

            {chat.description && <p className="mt-4 rounded-2xl bg-[var(--panel-2)] p-3 text-sm">{chat.description}</p>}

            {chat.isPrivate && <div className="mt-1 text-center text-xs text-[var(--muted)]">🔒 приватный {chat.type === 'channel' ? 'канал' : 'чат'}</div>}

            <div className="mt-4 space-y-1">
              {(chat.type === 'group' || chat.type === 'channel') && isAdmin && (
                <Row onClick={() => setEditOpen(true)} icon={<Pencil size={18} />} label="Редактировать" />
              )}
              <Row onClick={mute} icon={chat.muted ? <BellOff size={18} /> : <Bell size={18} />} label={chat.muted ? 'Включить уведомления' : 'Выключить уведомления'} />
              <Row onClick={pinChat} icon={<Pin size={18} />} label={chat.pinned ? 'Открепить чат' : 'Закрепить чат'} />
              {(chat.type === 'group' || chat.type === 'channel') && chat.inviteCode && (
                <Row onClick={copyInvite} icon={<Copy size={18} />} label="Скопировать инвайт-ссылку" />
              )}
              {(chat.type === 'group' || chat.type === 'channel') && !chat.inviteCode && isAdmin && (
                <Row onClick={makeInvite} icon={<Copy size={18} />} label="Создать инвайт-ссылку" />
              )}
            </div>

            {chat.type === 'group' && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-bold uppercase text-[var(--muted)]">Участники</div>
                  {isAdmin && (
                    <button onClick={() => { setAdding((v) => !v); setAddQuery('') }} className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline">
                      <UserPlus size={13} /> Добавить
                    </button>
                  )}
                </div>
                {adding && (
                  <div className="mb-2 rounded-xl border border-[var(--border)] p-2">
                    <input autoFocus value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="Найти человека…" className="input mb-1 !py-1.5 text-sm" />
                    <div className="max-h-40 space-y-0.5 overflow-y-auto fancy-scroll">
                      {directory
                        .filter((d) => d.kind === 'user' && !chat.memberUids.includes(d.uid))
                        .filter((d) => !addQuery.trim() || d.name.toLowerCase().includes(addQuery.toLowerCase()) || d.username.toLowerCase().includes(addQuery.toLowerCase()))
                        .slice(0, 8)
                        .map((d) => (
                          <button key={d.uid} onClick={() => addMember(d.uid)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--panel-hover)]">
                            <Avatar emoji={d.emoji} color={d.color} src={d.avatarUrl} size={28} />
                            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{d.name}</div>
                            <UserPlus size={14} className="text-[var(--accent)]" />
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  {chat.memberUids.map((uid) => {
                    const p = resolve(uid)
                    return (
                      <button key={uid} onClick={() => setProfileUid(uid)} onContextMenu={(e) => uid !== account.uid && openContextMenu(e, memberMenu(uid))} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-[var(--panel-hover)]">
                        <Avatar emoji={p.emoji} color={p.color} src={p.avatarUrl} size={36} online={presence[uid]?.online} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{p.name}{uid === account.uid ? ' (вы)' : ''}</div>
                          <div className="truncate text-xs text-[var(--muted)]">@{p.username}</div>
                        </div>
                        {uid === chat.ownerUid ? <span className="ml-auto chip">👑 владелец</span> : chat.adminUids.includes(uid) ? <span className="ml-auto chip">admin</span> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {chat.type !== 'saved' && (
              <button onClick={leave} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300/40 py-2.5 font-semibold text-rose-500 hover:bg-rose-500/10">
                <LogOut size={18} /> {chat.type === 'channel' ? 'Отписаться' : chat.type === 'group' ? 'Покинуть группу' : 'Удалить чат'}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {chat && editOpen && <GroupEditModal key={chat.id} chat={chat} open={editOpen} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

function ProfileBody({ uid, onMessage }: { uid: string; onMessage: () => void }) {
  const { resolve } = usePeople()
  const account = useStore((s) => s.account)!
  const presence = useStore((s) => s.presence)
  const directory = useStore((s) => s.directory)
  const toast = useStore((s) => s.toast)
  const p = resolve(uid)
  const dir = directory.find((x) => x.uid === uid)
  const isMe = uid === account.uid
  const p2 = presence[uid]
  return (
    <div className="px-5 pb-8">
      <div className="flex flex-col items-center text-center">
        <Avatar emoji={p.emoji} color={p.color} src={p.avatarUrl} size={100} online={p2?.online} />
        <div className="mt-3 flex items-center gap-1.5 text-xl font-black">{p.name} {p.verified && <Verified size={19} />}</div>
        <div className="text-sm text-[var(--muted)]">@{p.username}{p.numId ? ` · #${p.numId}` : ''}</div>
        {p2 && <div className={classNames('mt-0.5 text-xs', p2.online ? 'text-emerald-500' : 'text-[var(--muted)]')}>{p.isBot ? 'бот' : lastSeenLabel(p2.lastSeen, p2.online)}</div>}
      </div>

      {dir?.bio && <p className="mt-4 rounded-2xl bg-[var(--panel-2)] p-3 text-sm">{dir.bio}</p>}

      <div className="mt-4 rounded-2xl border border-[var(--border)]">
        <InfoRow label="Юзернейм" value={`@${p.username}`} />
        {p.numId > 0 && <InfoRow label="ID аккаунта" value={`#${p.numId}`} />}
        {p.isBot && <InfoRow label="Тип" value="Бот 🤖" />}
      </div>

      {!isMe && (
        <div className="mt-5 space-y-1">
          <button onClick={onMessage} className="btn-primary w-full"><MessageCircle size={18} /> Написать сообщение</button>
          <Row onClick={() => toast('Пользователь заблокирован (демо)', '🚫')} icon={<Ban size={18} />} label="Заблокировать" danger />
        </div>
      )}
    </div>
  )
}

function Row({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={classNames('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-[var(--panel-hover)]', danger && 'text-rose-500')}>
      {icon} {label}
    </button>
  )
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5 last:border-0">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}
