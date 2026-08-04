import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Avatar } from '../ui/Avatar'
import { useStore } from '../../store/useStore'
import { chatCounterpart, usePeople } from './people'
import { FOLDER_EMOJI, MAX_FOLDERS, loadFolders, newFolderId, saveFolders, type ChatFolder } from '../../lib/folders'
import { classNames } from '../../lib/util'

/**
 * Редактор своих папок. Списка слева нет, потому что папок всегда мало:
 * сначала перечисление, потом одна выбранная папка целиком.
 */
export function FolderManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const account = useStore((s) => s.account)!
  const chats = useStore((s) => s.chats)
  const toast = useStore((s) => s.toast)
  const { resolve } = usePeople()

  const [folders, setFolders] = useState<ChatFolder[]>(() => loadFolders(account.uid))
  const [draft, setDraft] = useState<ChatFolder | null>(null)

  function persist(next: ChatFolder[]) {
    setFolders(next)
    saveFolders(account.uid, next)
  }

  function startNew() {
    if (folders.length >= MAX_FOLDERS) {
      toast(`Папок может быть не больше ${MAX_FOLDERS}`, '📁')
      return
    }
    setDraft({ id: newFolderId(), name: '', emoji: '📁', chatIds: [] })
  }

  function saveDraft() {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) {
      toast('У папки должно быть название', '✏️')
      return
    }
    if (!draft.chatIds.length) {
      toast('Добавь в папку хотя бы один чат', '💬')
      return
    }
    const clean = { ...draft, name }
    const exists = folders.some((f) => f.id === clean.id)
    persist(exists ? folders.map((f) => (f.id === clean.id ? clean : f)) : [...folders, clean])
    setDraft(null)
  }

  function removeFolder(id: string) {
    persist(folders.filter((f) => f.id !== id))
    if (draft?.id === id) setDraft(null)
  }

  /** Как чат подписан в списке — теми же правилами, что и в боковой панели. */
  function chatVisual(chatId: string) {
    const c = chats.find((x) => x.id === chatId)
    if (!c) return { title: 'Чат', emoji: '💬', color: '#7c9cff', avatarUrl: undefined as string | undefined }
    if (c.type === 'saved') return { title: 'Избранное', emoji: '🔖', color: '#7cc4ff', avatarUrl: undefined }
    if (c.type === 'dm' || c.type === 'bot') {
      const other = chatCounterpart(c, account.uid)
      const p = other ? resolve(other) : null
      return { title: p?.name ?? c.title, emoji: p?.emoji ?? c.emoji, color: p?.color ?? c.color, avatarUrl: p?.avatarUrl }
    }
    return { title: c.title, emoji: c.emoji, color: c.color, avatarUrl: c.avatarUrl }
  }

  return (
    <Modal open={open} onClose={onClose} title={draft ? 'Папка' : 'Папки чатов'} wide>
      {draft ? (
        <div className="space-y-4">
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 24) })}
            placeholder="Название папки"
            className="input"
          />

          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {FOLDER_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => setDraft({ ...draft, emoji: e })}
                className={classNames(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg transition',
                  draft.emoji === e ? 'accent-gradient text-white' : 'bg-[var(--panel-2)] hover:bg-[var(--panel-hover)]',
                )}
              >
                <span className="emoji">{e}</span>
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Внутри · {draft.chatIds.length}</div>
            <div className="fancy-scroll max-h-[46vh] space-y-1 overflow-y-auto pr-1">
              {chats.length === 0 && <div className="px-2 py-6 text-center text-sm text-[var(--muted)]">Чатов пока нет</div>}
              {chats.map((c) => {
                const v = chatVisual(c.id)
                const on = draft.chatIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        chatIds: on ? draft.chatIds.filter((x) => x !== c.id) : [...draft.chatIds, c.id],
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-[var(--panel-hover)]"
                  >
                    <Avatar emoji={v.emoji} color={v.color} src={v.avatarUrl} size={36} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{v.title}</span>
                    <span
                      className={classNames(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full transition',
                        on ? 'accent-gradient text-white' : 'border border-[var(--border)] text-transparent',
                      )}
                    >
                      <Check size={14} strokeWidth={3} />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setDraft(null)} className="btn-ghost flex-1">Назад</button>
            <button onClick={saveDraft} className="btn-primary flex-1">Сохранить</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Папки группируют чаты в боковой панели и хранятся на этом устройстве — другие участники их не видят.
          </p>

          {folders.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              Папок пока нет. Собери первую — например, «💜 Самые близкие» ✨
            </div>
          )}

          {folders.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-2xl bg-[var(--panel-2)] px-3 py-2.5">
              <span className="emoji text-xl">{f.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{f.name}</div>
                <div className="text-xs text-[var(--muted)]">чатов: {f.chatIds.length}</div>
              </div>
              <button onClick={() => setDraft(f)} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--panel-hover)] hover:text-[var(--text)]">
                Изменить
              </button>
              <button
                onClick={() => removeFolder(f.id)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-rose-500 transition hover:bg-rose-500/10"
                title="Удалить папку"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <button onClick={startNew} className="btn-primary flex w-full items-center justify-center gap-2">
            <Plus size={17} /> Новая папка
          </button>
        </div>
      )}
    </Modal>
  )
}
