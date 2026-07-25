import { useRef, useState } from 'react'
import { Camera, Copy, RefreshCw } from 'lucide-react'
import type { Chat } from '../../types'
import { useStore } from '../../store/useStore'
import { Modal } from '../ui/Modal'
import { Avatar } from '../ui/Avatar'
import { EmojiPicker } from '../ui/EmojiPicker'
import { normalizeUsername, uid as rid } from '../../lib/util'
import { downscaleImage } from '../../lib/media'

/** Admin-only editor for groups and channels: photo, title, description, privacy. */
export function GroupEditModal({ chat, open, onClose }: { chat: Chat; open: boolean; onClose: () => void }) {
  const backend = useStore((s) => s.backend)!
  const refreshChats = useStore((s) => s.refreshChats)
  const toast = useStore((s) => s.toast)

  const [title, setTitle] = useState(chat.title)
  const [description, setDescription] = useState(chat.description ?? '')
  const [emoji, setEmoji] = useState(chat.emoji)
  const [username, setUsername] = useState(chat.username ?? '')
  const [avatarUrl, setAvatarUrl] = useState(chat.avatarUrl)
  const [isPrivate, setIsPrivate] = useState(!!chat.isPrivate)
  const [inviteCode, setInviteCode] = useState(chat.inviteCode ?? '')
  const [picker, setPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isChannel = chat.type === 'channel'
  const effectiveCode = inviteCode || undefined
  const inviteLink = effectiveCode ? `${location.origin}/#join=${effectiveCode}` : ''

  function togglePrivate(next: boolean) {
    setIsPrivate(next)
    if (next && !inviteCode) setInviteCode(rid().slice(0, 10))
  }

  async function uploadPhoto(file: File) {
    if (!file.type.startsWith('image/')) return toast('Выбери картинку (jpg, png, webp, gif)', '🖼️')
    setUploading(true)
    try {
      const blob = await downscaleImage(file, 512, 0.9)
      const { url } = await backend.uploadFile('avatar', blob, file.name)
      setAvatarUrl(url)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось загрузить фото', '⚠️')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    if (!title.trim()) return toast('Название не может быть пустым', '✏️')
    setSaving(true)
    try {
      await backend.updateChat(chat.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        emoji,
        avatarUrl,
        isPrivate,
        username: isPrivate ? undefined : username ? normalizeUsername(username) : undefined,
        inviteCode: isPrivate ? inviteCode : chat.inviteCode, // keep old code so existing links survive re-privating
      })
      await refreshChats()
      toast('Изменения сохранены', '✅')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сохранить', '⚠️')
    } finally {
      setSaving(false)
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteLink).then(
      () => toast('Ссылка скопирована', '📋'),
      () => toast('Не удалось скопировать', '⚠️'),
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={isChannel ? '📣 Редактировать канал' : '👥 Редактировать группу'}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setPicker((v) => !v)} className="group relative rounded-2xl" title="Эмодзи чата">
              <Avatar emoji={emoji} color={chat.color} src={avatarUrl} size={60} />
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
                <Camera size={20} />
              </span>
            </button>
            {picker && <EmojiPicker onPick={(e) => { setEmoji(e); setPicker(false) }} onClose={() => setPicker(false)} />}
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="chip text-xs">
              {uploading ? 'Загрузка…' : avatarUrl ? 'Сменить фото' : 'Загрузить фото'}
            </button>
            {avatarUrl && (
              <button onClick={() => setAvatarUrl(undefined)} className="text-xs text-[var(--muted)] hover:text-rose-400">
                Убрать фото
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" className="input flex-1" />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Описание</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="О чём это место?" className="input resize-none" />
        </label>

        {/* privacy */}
        <div className="rounded-2xl border border-[var(--border)] p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{isPrivate ? '🔒 Приватный чат' : '🌐 Публичный чат'}</div>
              <div className="text-xs text-[var(--muted)]">
                {isPrivate ? 'Не отображается в поиске, вход только по инвайт-ссылке' : 'Виден в поиске, вход по @имени'}
              </div>
            </div>
            <button
              onClick={() => togglePrivate(!isPrivate)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${isPrivate ? 'accent-gradient' : 'bg-[var(--panel-2)] border border-[var(--border)]'}`}
              role="switch"
              aria-checked={isPrivate}
              title="Переключить приватность"
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isPrivate ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {isPrivate ? (
            <div className="mt-3">
              <div className="mb-1 text-xs font-bold uppercase text-[var(--muted)]">Инвайт-ссылка</div>
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-xs">{inviteLink}</div>
                <button onClick={copyInvite} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] hover:bg-[var(--panel-hover)]" title="Копировать">
                  <Copy size={15} />
                </button>
                <button
                  onClick={() => { setInviteCode(rid().slice(0, 10)); toast('Новая ссылка сгенерирована — не забудь сохранить', '🔄') }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] hover:bg-[var(--panel-hover)]"
                  title="Сгенерировать новую ссылку (старая перестанет работать)"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>
          ) : (
            <label className="mt-3 block">
              <div className="mb-1 text-xs font-bold uppercase text-[var(--muted)]">Публичная ссылка</div>
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3">
                <span className="text-[var(--muted)]">@</span>
                <input value={username} onChange={(e) => setUsername(normalizeUsername(e.target.value))} placeholder={isChannel ? 'my_channel' : 'my_group'} className="w-full bg-transparent px-1 py-2.5 outline-none" />
              </div>
            </label>
          )}
        </div>

        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </Modal>
  )
}
