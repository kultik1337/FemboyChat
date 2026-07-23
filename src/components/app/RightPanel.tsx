import { Ban, Bell, BellOff, LogOut, MessageCircle, Pin, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Avatar } from '../ui/Avatar'
import { chatCounterpart, usePeople } from './people'
import { classNames, lastSeenLabel } from '../../lib/util'

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
      <div className="relative h-full w-full max-w-sm overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] shadow-2xl animate-slide-up" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-bold">{showProfile ? 'Профиль' : 'Информация'}</h3>
          <button onClick={close} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--panel-hover)]"><X size={18} /></button>
        </div>

        {showProfile ? (
          <ProfileBody uid={showProfile} onMessage={() => { const d = directory.find((x) => x.uid === showProfile) ?? { uid: showProfile } as any; startWith(d); close() }} />
        ) : chat ? (
          <div className="px-5 pb-8">
            <div className="flex flex-col items-center text-center">
              <Avatar emoji={chat.emoji} color={chat.color} size={92} />
              <div className="mt-3 flex items-center gap-1 text-xl font-black">{chat.title} {chat.verified && <span className="text-[var(--accent)]">✔</span>}</div>
              {chat.username && <div className="text-sm text-[var(--muted)]">@{chat.username}</div>}
              <div className="mt-1 text-sm text-[var(--muted)]">
                {chat.type === 'channel' ? `${(chat.memberCount ?? 0).toLocaleString('ru-RU')} подписчиков` : `${chat.memberCount ?? chat.memberUids.length} участников`}
              </div>
            </div>

            {chat.description && <p className="mt-4 rounded-2xl bg-[var(--panel-2)] p-3 text-sm">{chat.description}</p>}

            <div className="mt-4 space-y-1">
              <Row onClick={mute} icon={chat.muted ? <BellOff size={18} /> : <Bell size={18} />} label={chat.muted ? 'Включить уведомления' : 'Выключить уведомления'} />
              <Row onClick={pinChat} icon={<Pin size={18} />} label={chat.pinned ? 'Открепить чат' : 'Закрепить чат'} />
            </div>

            {chat.type === 'group' && (
              <div className="mt-5">
                <div className="mb-2 text-xs font-bold uppercase text-[var(--muted)]">Участники</div>
                <div className="space-y-1">
                  {chat.memberUids.map((uid) => {
                    const p = resolve(uid)
                    return (
                      <button key={uid} onClick={() => setProfileUid(uid)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-[var(--panel-hover)]">
                        <Avatar emoji={p.emoji} color={p.color} size={36} online={presence[uid]?.online} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{p.name}{uid === account.uid ? ' (вы)' : ''}</div>
                          <div className="truncate text-xs text-[var(--muted)]">@{p.username}</div>
                        </div>
                        {chat.adminUids.includes(uid) && <span className="ml-auto chip">admin</span>}
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
        <Avatar emoji={p.emoji} color={p.color} size={100} online={p2?.online} />
        <div className="mt-3 flex items-center gap-1 text-xl font-black">{p.name} {p.verified && <span className="text-[var(--accent)]">✔</span>}</div>
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
