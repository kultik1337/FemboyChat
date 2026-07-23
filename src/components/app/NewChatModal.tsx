import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { Modal } from '../ui/Modal'
import { EmojiPicker } from '../ui/EmojiPicker'
import { Avatar } from '../ui/Avatar'
import { normalizeUsername } from '../../lib/util'

export function NewChatModal() {
  const kind = useStore((s) => s.newChatKind)
  const setKind = useStore((s) => s.setNewChatKind)
  const createChat = useStore((s) => s.createChat)
  const directory = useStore((s) => s.directory)

  const [title, setTitle] = useState('')
  const [username, setUsername] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState(kind === 'channel' ? '📣' : '💬')
  const [picker, setPicker] = useState(false)
  const [members, setMembers] = useState<string[]>([])

  const people = directory.filter((d) => d.kind === 'user')
  const open = kind !== null
  const isChannel = kind === 'channel'

  function reset() {
    setTitle(''); setUsername(''); setDescription(''); setMembers([]); setEmoji(isChannel ? '📣' : '💬')
  }

  return (
    <Modal open={open} onClose={() => { setKind(null); reset() }} title={isChannel ? '📣 Новый канал' : '👥 Новая группа'}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setPicker((v) => !v)} className="rounded-2xl">
              <Avatar emoji={emoji} color="#ff7ab8" size={60} />
            </button>
            {picker && <EmojiPicker onPick={(e) => { setEmoji(e); setPicker(false) }} onClose={() => setPicker(false)} />}
          </div>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isChannel ? 'Название канала' : 'Название группы'} className="input flex-1" />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Публичная ссылка <span className="text-[var(--muted)]">(необязательно)</span></span>
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3">
            <span className="text-[var(--muted)]">@</span>
            <input value={username} onChange={(e) => setUsername(normalizeUsername(e.target.value))} placeholder={isChannel ? 'my_channel' : 'my_group'} className="w-full bg-transparent px-1 py-2.5 outline-none" />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Описание</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="О чём это место?" className="input resize-none" />
        </label>

        {!isChannel && (
          <div>
            <div className="mb-2 text-sm font-semibold">Добавить участников</div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-1">
              {people.map((p) => {
                const on = members.includes(p.uid)
                return (
                  <button
                    key={p.uid}
                    onClick={() => setMembers((m) => (on ? m.filter((x) => x !== p.uid) : [...m, p.uid]))}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--panel-hover)]"
                  >
                    <Avatar emoji={p.emoji} color={p.color} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <div className="truncate text-xs text-[var(--muted)]">@{p.username}</div>
                    </div>
                    <span className={`grid h-5 w-5 place-items-center rounded-full border ${on ? 'accent-gradient border-transparent text-white' : 'border-[var(--border)]'}`}>{on ? '✓' : ''}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button
          disabled={!title.trim()}
          onClick={() => { createChat({ type: kind!, title: title.trim(), description: description.trim() || undefined, emoji, username: username || undefined, memberUids: members }); reset() }}
          className="btn-primary w-full disabled:opacity-50"
        >
          {isChannel ? 'Создать канал' : 'Создать группу'}
        </button>
      </div>
    </Modal>
  )
}
