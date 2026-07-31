import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { usePerks } from '../../lib/perks'
import { classNames } from '../../lib/util'
import { Avatar } from '../ui/Avatar'
import { Bot, MessageCircle, Pencil, Plus, Sparkles, Trash2, X } from '../ui/icons'
import { playSound } from '../../lib/sound'

/**
 * Bot studio: build a character, get a chat with it.
 *
 * A bot here is just a profile with `is_bot`, so the moment one exists every
 * screen in the app already knows how to draw it, search it and open a chat
 * with it — `open_dm` even creates the conversation as type `bot` on its own.
 * That is why this file is only a form: all the hard parts already existed.
 *
 * The persona is the whole product. It is sent to the model as the system
 * prompt, so «ты ворчливый кот, отвечаешь коротко и свысока» is a
 * complete bot. The examples exist because a blank textarea is the fastest way
 * to make somebody close a feature.
 */

interface BotRow {
  uid: string
  username: string
  name: string
  emoji: string
  color: string
  persona: string
  greeting: string
  is_public: boolean
  created_at: string
}

const EXAMPLES = [
  { emoji: '🐱', name: 'Кот Барсик', persona: 'Ты ворчливый домашний кот. Отвечаешь коротко, лениво и чуть свысока, всё сводишь к еде и сну.' },
  { emoji: '📚', name: 'Репетитор', persona: 'Ты терпеливый репетитор. Объясняешь простыми словами, задаёшь наводящие вопросы и никогда не ругаешься за ошибки.' },
  { emoji: '🌙', name: 'Собеседник', persona: 'Ты тёплый ночной собеседник. Слушаешь, поддерживаешь, не даёшь непрошеных советов и пишешь мягко.' },
]

const EMOJI_CHOICES = ['🤖', '🐱', '🦊', '🐻', '🌙', '✨', '📚', '🎧', '🔮', '🍓', '👾', '🌸']

export function BotStudio({ onClose }: { onClose: () => void }) {
  const backend = useStore((s) => s.backend)
  const toast = useStore((s) => s.toast)
  const refreshChats = useStore((s) => s.refreshChats)
  const openChat = useStore((s) => s.openChat)
  const perks = usePerks()

  const [bots, setBots] = useState<BotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BotRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  // form state
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🤖')
  const [persona, setPersona] = useState('')
  const [greeting, setGreeting] = useState('')

  async function reload() {
    setLoading(true)
    const raw = await backend?.rpc?.('my_bots')
    setBots(Array.isArray(raw) ? (raw as BotRow[]) : [])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend])

  function startCreate() {
    setEditing(null)
    setCreating(true)
    setUsername('')
    setName('')
    setEmoji('🤖')
    setPersona('')
    setGreeting('')
  }

  function startEdit(bot: BotRow) {
    setCreating(false)
    setEditing(bot)
    setUsername(bot.username)
    setName(bot.name)
    setEmoji(bot.emoji || '🤖')
    setPersona(bot.persona)
    setGreeting(bot.greeting)
  }

  function closeForm() {
    setCreating(false)
    setEditing(null)
  }

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      if (editing) {
        const res = await backend?.rpc?.('update_bot', {
          p_uid: editing.uid,
          p_name: name,
          p_persona: persona,
          p_greeting: greeting,
          p_emoji: emoji,
        })
        if (!res) throw new Error('Не получилось сохранить')
        toast('Бот обновлён', '🤖')
      } else {
        const res = (await backend?.rpc?.('create_bot', {
          p_username: username,
          p_name: name,
          p_persona: persona,
          p_greeting: greeting,
          p_emoji: emoji,
        })) as { uid?: string } | null
        if (!res?.uid) throw new Error('Не получилось создать бота')
        toast('Бот готов ✨', '🤖')
      }
      playSound('success')
      closeForm()
      await reload()
    } catch (e) {
      playSound('error')
      toast(e instanceof Error ? e.message : 'Что-то пошло не так', '⚠️')
    } finally {
      setBusy(false)
    }
  }

  async function remove(bot: BotRow) {
    if (!confirm(`Удалить бота «${bot.name}»? Чаты с ним останутся, но он больше не ответит.`)) return
    await backend?.rpc?.('delete_bot', { p_uid: bot.uid })
    await reload()
  }

  /** Open a conversation with the bot right away — that is the point of it. */
  async function talk(bot: BotRow) {
    try {
      const chat = await backend?.openDM(bot.uid)
      if (!chat) return
      await refreshChats()
      await openChat(chat.id)
      onClose()
    } catch {
      toast('Не получилось открыть чат', '⚠️')
    }
  }

  const formOpen = creating || !!editing
  const canAddMore = bots.length < perks.max_bots

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="animate-pop-in flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Bot size={18} className="accent-text shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">Свои боты</div>
            <div className="truncate text-[11px] text-[var(--muted)]">
              {perks.can_create_bots ? `${bots.length} из ${perks.max_bots}` : 'Доступ выдаёт администратор'}
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
            <X size={16} />
          </button>
        </div>

        <div className="fancy-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!perks.can_create_bots && (
            <div className="grid place-items-center gap-2 py-12 text-center text-sm text-[var(--muted)]">
              <Sparkles size={28} className="accent-text" />
              Создавать ботов пока могут не все.
              <span className="text-xs">Попроси администратора выдать доступ.</span>
            </div>
          )}

          {perks.can_create_bots && !formOpen && (
            <>
              {loading && <div className="py-8 text-center text-sm text-[var(--muted)]">Загружаем…</div>}

              {!loading && bots.length === 0 && (
                <div className="grid place-items-center gap-2 py-10 text-center text-sm text-[var(--muted)]">
                  <Bot size={30} className="accent-text" />
                  Здесь появятся твои персонажи.
                  <span className="text-xs">Опиши характер парой фраз — этого достаточно.</span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {bots.map((bot) => (
                  <div key={bot.uid} className="flex items-center gap-2 rounded-2xl border border-[var(--border)] p-3">
                    <Avatar emoji={bot.emoji || '🤖'} color={bot.color || '#7c9cff'} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{bot.name}</div>
                      <div className="truncate text-xs text-[var(--muted)]">@{bot.username}</div>
                    </div>
                    <button onClick={() => void talk(bot)} title="Открыть чат" className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
                      <MessageCircle size={16} />
                    </button>
                    <button onClick={() => startEdit(bot)} title="Изменить" className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => void remove(bot)} title="Удалить" className="grid h-8 w-8 place-items-center rounded-full text-red-400 hover:bg-[var(--panel-hover)]">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={startCreate}
                disabled={!canAddMore}
                className={classNames('btn-primary mt-3 flex w-full items-center justify-center gap-1.5 text-sm', !canAddMore && 'opacity-50')}
              >
                <Plus size={16} />
                {canAddMore ? 'Новый бот' : 'Лимит исчерпан'}
              </button>
            </>
          )}

          {formOpen && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Avatar emoji={emoji} color="#7c9cff" size={44} />
                <div className="flex flex-wrap gap-1">
                  {EMOJI_CHOICES.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={classNames(
                        'grid h-8 w-8 place-items-center rounded-full text-lg transition',
                        emoji === e ? 'bg-[var(--accent)]' : 'hover:bg-[var(--panel-hover)]',
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
                Имя
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Кот Барсик" className="input text-sm" />
              </label>

              {!editing && (
                <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
                  Юзернейм — потом не поменять
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                    placeholder="barsik_bot"
                    className="input text-sm"
                  />
                </label>
              )}

              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
                Характер — это и есть бот
                <textarea
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  rows={5}
                  placeholder="Ты ворчливый кот. Отвечаешь коротко и свысока…"
                  className="input resize-none text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
                Первое сообщение в чате — необязательно
                <input value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="Мрр. Чего тебе?" className="input text-sm" />
              </label>

              {!editing && (
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.name}
                      onClick={() => {
                        setEmoji(ex.emoji)
                        setName(ex.name)
                        setPersona(ex.persona)
                      }}
                      className="chip text-xs"
                    >
                      {ex.emoji} {ex.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={closeForm} className="btn-ghost text-sm">Отмена</button>
                <button
                  onClick={() => void save()}
                  disabled={busy || !name.trim() || (!editing && username.trim().length < 3)}
                  className="btn-primary ml-auto text-sm disabled:opacity-50"
                >
                  {editing ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
