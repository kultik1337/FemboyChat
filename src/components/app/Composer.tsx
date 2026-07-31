import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock,
  CornerUpLeft,
  Eye,
  EyeOff,
  FileText,
  ImagePlay,
  ListChecks,
  Loader2,
  Mic,
  Music,
  Paperclip,
  Plus,
  Quote,
  Send,
  Smile,
  Sticker as StickerIcon,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { EmojiPicker } from '../ui/EmojiPicker'
import { Avatar } from '../ui/Avatar'
import { Sticker } from '../ui/Sticker'
import { STICKER_PACKS } from '../../lib/stickers'
import { SLASH_COMMANDS, applyEmoticons, runCommand } from '../../lib/commands'
import { GIF_CATEGORIES, fetchGifs, type GifResult } from '../../lib/gifs'
import { attachmentKindFor, downscaleImage, imageSize, prettySize } from '../../lib/media'
import { beep } from '../../lib/sound'
import type { Attachment, Poll } from '../../types'
import { usePeople } from './people'
import { classNames } from '../../lib/util'

const TTLS = [
  { label: 'Выкл', v: 0 },
  { label: '5 сек', v: 5 },
  { label: '30 сек', v: 30 },
  { label: '1 мин', v: 60 },
  { label: '5 мин', v: 300 },
]

const draftKey = (id: string) => `fc:draft:${id}`

/** Longest message the server will store. Matches the AI worker's own cap. */
const MAX_LEN = 4000

/** Start warning about the length only when the end is actually in sight. */
const COUNTER_FROM = MAX_LEN - 300

/**
 * True on touch-first devices. Focusing the input there would slide the on-screen
 * keyboard up over half the conversation every time a chat is opened, so the
 * automatic focus is desktop-only — exactly how other messengers behave.
 */
function isCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

export function Composer() {
  const send = useStore((s) => s.send)
  const edit = useStore((s) => s.edit)
  const typingPing = useStore((s) => s.typingPing)
  const chatId = useStore((s) => s.activeChatId)!
  const account = useStore((s) => s.account!)
  const settings = account.settings
  const messages = useStore((s) => s.messages)
  const toast = useStore((s) => s.toast)
  const replyTo = useStore((s) => s.composeReply)
  /** Set when the reply was started from a highlighted piece of the message. */
  const quote = useStore((s) => s.composeQuote)
  const editing = useStore((s) => s.composeEdit)
  const setReply = useStore((s) => s.setComposeReply)
  const setEdit = useStore((s) => s.setComposeEdit)
  const pending = useStore((s) => s.pendingFiles)
  const addPendingFiles = useStore((s) => s.addPendingFiles)
  const removePendingFile = useStore((s) => s.removePendingFile)
  const clearPendingFiles = useStore((s) => s.clearPendingFiles)
  const chats = useStore((s) => s.chats)
  const { resolve } = usePeople()
  const chat = chats.find((c) => c.id === chatId)

  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [stickers, setStickers] = useState(false)
  const [gifs, setGifs] = useState(false)
  const [ttl, setTtl] = useState(0)
  const [ttlOpen, setTtlOpen] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [spoiler, setSpoiler] = useState(false)
  // Phone-only sheet holding the actions that no longer fit on the bar.
  const [moreOpen, setMoreOpen] = useState(false)
  // Which autocomplete row the arrow keys are currently on, and whether Escape
  // has hidden the list for the token being typed.
  const [acIndex, setAcIndex] = useState(0)
  const [acHidden, setAcHidden] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /**
   * Put the cursor in the input, at the end of whatever text is already there.
   * Deferred by a frame because the textarea is often (re)mounted or resized in
   * the same commit, and focusing before layout settles scrolls the pane.
   */
  function focusInput() {
    if (isCoarsePointer()) return
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus({ preventScroll: true })
      const end = el.value.length
      try {
        el.setSelectionRange(end, end)
      } catch {
        /* not all browsers allow this on a hidden element */
      }
    })
  }

  // Load per-chat draft when switching chats, then take the cursor so the chat
  // is immediately typeable.
  useEffect(() => {
    setSpoiler(false)
    setMoreOpen(false)
    if (useStore.getState().composeEdit) return
    setText(localStorage.getItem(draftKey(chatId)) ?? '')
    focusInput()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  // Answering a message should also drop you straight into the input.
  useEffect(() => {
    if (replyTo) focusInput()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTo?.id, quote])

  useEffect(() => {
    if (editing) {
      setText(editing.text)
      focusInput()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  function autosize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }
  useEffect(autosize, [text])

  function updateText(v: string) {
    setText(v)
    setAcHidden(false)
    if (!editing) {
      if (v) localStorage.setItem(draftKey(chatId), v)
      else localStorage.removeItem(draftKey(chatId))
    }
    typingPing(chatId)
  }

  const slashQuery = useMemo(() => {
    if (editing || !text.startsWith('/') || /\s/.test(text)) return null
    return text.slice(1).toLowerCase()
  }, [text, editing])
  const slashMatches = useMemo(
    () => (slashQuery === null ? [] : SLASH_COMMANDS.filter((c) => c.name.startsWith(slashQuery))),
    [slashQuery],
  )

  // @mention autocomplete: matches the trailing "@..." token.
  const mentionQuery = useMemo(() => {
    if (editing) return null
    const m = /(^|\s)@([a-zA-Z0-9_]{0,24})$/.exec(text)
    return m ? m[2].toLowerCase() : null
  }, [text, editing])
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null || !chat) return []
    return chat.memberUids
      .filter((u) => u !== account.uid)
      .map(resolve)
      .filter((p) => p.username && (p.username.toLowerCase().startsWith(mentionQuery) || p.name.toLowerCase().startsWith(mentionQuery)))
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionQuery, chat?.id, chat?.memberUids.length])

  // Both lists are keyboard-driven through one cursor; only one can be open at
  // a time because their triggers ("/…" at the start, "@…" at the end) exclude
  // each other.
  const acList: 'mention' | 'slash' | null = mentionMatches.length ? 'mention' : slashMatches.length ? 'slash' : null
  const acCount = acList === 'mention' ? mentionMatches.length : acList === 'slash' ? slashMatches.length : 0
  const acOpen = !acHidden && acCount > 0

  // A new query means a new list, so the cursor goes back to the top.
  useEffect(() => {
    setAcIndex(0)
  }, [slashQuery, mentionQuery])

  function pickMention(username: string) {
    updateText(text.replace(/@[a-zA-Z0-9_]{0,24}$/, `@${username} `))
    ref.current?.focus()
  }

  function pickSlash(name: string) {
    setText(`/${name} `)
    setAcHidden(true)
    ref.current?.focus()
  }

  /** Take whatever the autocomplete cursor is sitting on. */
  function acceptAutocomplete() {
    const i = Math.min(acIndex, acCount - 1)
    if (acList === 'mention') pickMention(mentionMatches[i].username)
    else if (acList === 'slash') pickSlash(slashMatches[i].name)
  }

  /** Close every tray/sheet the bar can open. */
  function closeTrays() {
    setEmoji(false)
    setStickers(false)
    setGifs(false)
    setMoreOpen(false)
    setTtlOpen(false)
  }

  function afterSend() {
    if (settings.sendSound) beep()
    // Clearing the reply also clears the quoted fragment attached to it.
    setReply(null)
    setText('')
    localStorage.removeItem(draftKey(chatId))
    focusInput()
  }

  async function sendPendingFiles(caption: string) {
    setSending(true)
    try {
      const backend = useStore.getState().backend!
      const files = [...pending]
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const kind = attachmentKindFor(f)
        const blob = kind === 'image' ? await downscaleImage(f) : f
        const dims = kind === 'image' || kind === 'gif' ? await imageSize(blob) : null
        const { url } = await backend.uploadFile('attachment', blob, f.name)
        const attachment: Attachment = {
          kind,
          url,
          name: f.name,
          size: blob.size,
          mime: blob.type || f.type || undefined,
          w: dims?.w,
          h: dims?.h,
          spoiler: spoiler && (kind === 'image' || kind === 'gif' || kind === 'video') ? true : undefined,
        }
        await send({
          text: i === 0 ? caption : '',
          attachment,
          replyToId: i === 0 ? replyTo?.id : undefined,
          quote: i === 0 ? quote ?? undefined : undefined,
          ttl: ttl || undefined,
        })
      }
      clearPendingFiles()
      setSpoiler(false)
      afterSend()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось отправить файл', '⚠️')
    } finally {
      setSending(false)
    }
  }

  async function sendGif(g: GifResult) {
    setGifs(false)
    await send({ text: '', attachment: { kind: 'gif', url: g.url, name: g.anime }, replyToId: replyTo?.id, quote: quote ?? undefined })
    setReply(null)
    if (settings.sendSound) beep()
  }

  function submit() {
    if (sending) return
    const t = text.trim()

    if (t.length > MAX_LEN) {
      toast(`Слишком длинное — убери ещё ${t.length - MAX_LEN} символов`, '✏️')
      return
    }

    if (editing) {
      if (!t) return
      edit(editing.id, t)
      setEdit(null)
      setText('')
      focusInput()
      return
    }

    if (pending.length) {
      void sendPendingFiles(t)
      return
    }

    if (!t) return
    const cmd = runCommand(t, account.name)
    if (cmd) {
      if (cmd.toast) toast(cmd.toast.text, cmd.toast.emoji)
      if (cmd.text || cmd.sticker)
        send({ text: cmd.text ?? '', sticker: cmd.sticker, replyToId: replyTo?.id, quote: quote ?? undefined, ttl: ttl || undefined })
    } else {
      const body = settings.emoticons ? applyEmoticons(t) : t
      send({ text: body, replyToId: replyTo?.id, quote: quote ?? undefined, ttl: ttl || undefined })
    }
    afterSend()
  }

  function editLastMine() {
    const arr = messages[chatId] ?? []
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr[i]
      if (m.senderUid === account.uid && !m.deleted && !m.poll && !m.sticker && !m.attachment) {
        setEdit(m)
        return
      }
    }
  }

  /**
   * Keep a list going when Enter inserts a newline: a line that starts with a
   * bullet or a number gets the next marker for free, and pressing Enter on an
   * empty item ends the list instead of laying down markers forever.
   * Returns true when it handled the key.
   */
  function continueList(): boolean {
    const el = ref.current
    if (!el) return false
    const start = el.selectionStart
    const end = el.selectionEnd
    if (start !== end) return false

    const before = text.slice(0, start)
    const line = before.slice(before.lastIndexOf('\n') + 1)
    const m = /^(\s*)(?:([-*•])\s+|(\d+)\.\s+)/.exec(line)
    if (!m) return false

    const rest = text.slice(end)

    // Nothing after the marker: the person is done with the list.
    if (line.trim() === (m[2] ?? `${m[3]}.`)) {
      const head = before.slice(0, before.length - line.length)
      updateText(head + rest)
      requestAnimationFrame(() => el.setSelectionRange(head.length, head.length))
      return true
    }

    const marker = m[2] ? `${m[2]} ` : `${Number(m[3]) + 1}. `
    const insert = `\n${m[1]}${marker}`
    updateText(before + insert + rest)
    const caret = before.length + insert.length
    requestAnimationFrame(() => el.setSelectionRange(caret, caret))
    return true
  }

  function onKey(e: React.KeyboardEvent) {
    // The autocomplete owns the arrows and Enter while it is open, the same way
    // it does in editors — clicking a row was previously the only way to pick one.
    if (acOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAcIndex((i) => (i + 1) % acCount)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAcIndex((i) => (i - 1 + acCount) % acCount)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        acceptAutocomplete()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setAcHidden(true)
        return
      }
    }

    // Ctrl/⌘+Enter always sends, whatever "Enter отправляет" is set to.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend) {
      e.preventDefault()
      submit()
      return
    }

    // Any Enter that survives to here inserts a newline, so it can continue a list.
    if (e.key === 'Enter' && continueList()) {
      e.preventDefault()
      return
    }

    if (e.key === 'ArrowUp' && !text && !editing && !replyTo) {
      e.preventDefault()
      editLastMine()
    }
    if (e.key === 'Escape') {
      // Close whatever tray is open first; only then drop the reply or edit.
      if (emoji || stickers || gifs || moreOpen || ttlOpen) {
        closeTrays()
        return
      }
      setReply(null)
      setEdit(null)
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (files.length) {
      e.preventDefault()
      addPendingFiles(files)
    }
  }

  const canSend = !!text.trim() || pending.length > 0
  const showMic = !canSend && !editing && typeof navigator !== 'undefined' && !!navigator.mediaDevices
  const overLimit = text.length > MAX_LEN
  const ttlLabel = TTLS.find((o) => o.v === ttl)?.label ?? 'Выкл'

  return (
    <div
      className="relative border-t border-[var(--border)] bg-[var(--panel)] px-2 py-2 sm:px-3 sm:py-2.5"
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        // Ignore the leave events fired while crossing child elements.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragOver(false)
      }}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer.files ?? [])
        setDragOver(false)
        if (!files.length) return
        e.preventDefault()
        addPendingFiles(files)
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-1 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--panel-2)]/90 animate-pop-in">
          <div className="flex items-center gap-2 text-sm font-bold accent-text">
            <Paperclip size={17} /> Отпускай — прикреплю
          </div>
        </div>
      )}

      {(replyTo || editing) && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-[var(--panel-2)] px-3 py-2 text-sm">
          {quote && !editing ? <Quote size={16} className="shrink-0 text-[var(--accent)]" /> : <CornerUpLeft size={16} className="shrink-0 text-[var(--accent)]" />}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[var(--accent)]">
              {editing ? 'Редактирование' : `${quote ? 'Цитата' : 'Ответ'} · ${replyTo ? resolve(replyTo.senderUid).name : ''}`}
            </div>
            {/*
              A quote-reply shows the highlighted fragment instead of the whole
              message — that is the entire point of picking it.
            */}
            {quote && !editing ? (
              <div className="quote-mark truncate text-[var(--muted)]">{quote}</div>
            ) : (
              <div className="truncate text-[var(--muted)]">{editing ? editing.text : replyTo?.sticker ? 'стикер' : replyTo?.attachment ? attachmentChipLabel(replyTo.attachment) : replyTo?.text}</div>
            )}
          </div>
          <button onClick={() => { setReply(null); setEdit(null); setText('') }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-[var(--panel-hover)]">
            <X size={15} />
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {pending.map((f, i) => (
              <PendingChip key={`${f.name}-${i}`} file={f} spoiler={spoiler} onRemove={() => removePendingFile(i)} />
            ))}
          </div>
          {pending.some((f) => attachmentKindFor(f) !== 'file' && attachmentKindFor(f) !== 'audio') && (
            <button
              onClick={() => setSpoiler((v) => !v)}
              className={classNames(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition',
                spoiler ? 'border-[var(--accent)] accent-text' : 'border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-hover)]',
              )}
              title="Скрыть медиа за размытием до клика"
            >
              {spoiler ? <EyeOff size={14} /> : <Eye size={14} />} Спойлер
            </button>
          )}
        </div>
      )}

      {acOpen && acList === 'mention' && (
        <div className="absolute bottom-full left-2 right-2 z-30 mb-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="fancy-scroll max-h-56 overflow-y-auto p-1">
            {mentionMatches.map((p, i) => (
              <button
                key={p.uid}
                onClick={() => pickMention(p.username)}
                onMouseEnter={() => setAcIndex(i)}
                className={classNames(
                  'flex w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left hover:bg-[var(--panel-hover)]',
                  i === acIndex && 'bg-[var(--panel-hover)]',
                )}
              >
                <Avatar emoji={p.emoji} color={p.color} src={p.avatarUrl} size={30} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">@{p.username}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {acOpen && acList === 'slash' && (
        <div className="absolute bottom-full left-2 right-2 z-30 mb-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="fancy-scroll max-h-56 overflow-y-auto p-1">
            {slashMatches.map((c, i) => (
              <button
                key={c.name}
                onClick={() => pickSlash(c.name)}
                onMouseEnter={() => setAcIndex(i)}
                className={classNames(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[var(--panel-hover)]',
                  i === acIndex && 'bg-[var(--panel-hover)]',
                )}
              >
                <span className="text-xl">{c.emoji}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{c.hint}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{c.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {emoji && <EmojiPicker onPick={(e) => updateText(text + e)} onClose={() => setEmoji(false)} />}
      {stickers && <StickerTray onPick={(s) => { send({ text: '', sticker: s }); setStickers(false) }} onClose={() => setStickers(false)} />}
      {gifs && <GifTray onPick={sendGif} onClose={() => setGifs(false)} />}

      {/*
        The self-destruct menu lives at composer level rather than inside its
        button, because that button is hidden on phones — the «➕» sheet opens
        this same menu there.
      */}
      {ttlOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setTtlOpen(false)} />
          <div className="absolute bottom-16 right-3 z-30 w-40 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
            {TTLS.map((o) => (
              <button
                key={o.v}
                onClick={() => { setTtl(o.v); setTtlOpen(false) }}
                className={classNames('block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--panel-hover)]', ttl === o.v && 'font-bold accent-text')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addPendingFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />

      {recording ? (
        <VoiceRecorder
          onCancel={() => setRecording(false)}
          onDone={async (blob, durationSec) => {
            setRecording(false)
            setSending(true)
            try {
              const backend = useStore.getState().backend!
              const { url } = await backend.uploadFile('attachment', blob, 'voice')
              await send({
                text: '',
                attachment: { kind: 'voice', url, size: blob.size, mime: blob.type, durationSec },
                replyToId: replyTo?.id,
                quote: quote ?? undefined,
              })
              afterSend()
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Не удалось отправить голосовое', '⚠️')
            } finally {
              setSending(false)
            }
          }}
        />
      ) : (
        /*
          LAYOUT — one row, on every screen.

          Eight round buttons plus send need ~360px on their own, so on a 390px
          phone the field was left with a couple of dozen pixels and wrapped its
          placeholder one letter per line. Giving the field its own row fixed
          that but ate ~70px of vertical space on a screen that also has to fit
          a header, a pinned banner and the keyboard — the conversation was
          reduced to a slit.

          So on phones only four controls stay on the bar: «➕», the field,
          emoji and send. Stickers, GIFs, files, polls and self-destruct move
          into the «➕» sheet. From `sm` up the sheet button disappears, the
          hidden group turns into `display: contents`, and the familiar desktop
          bar is exactly as it was — the `order` values keep the field between
          the two icon groups.
        */
        <div className="flex items-end gap-0.5 sm:gap-1">
          <div className="relative sm:hidden">
            <IconButton title="Ещё" active={moreOpen} onClick={() => { setMoreOpen((v) => !v); setEmoji(false); setStickers(false); setGifs(false) }}>
              <Plus size={22} className={classNames('transition-transform', moreOpen && 'rotate-45')} />
            </IconButton>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
                <div className="absolute bottom-12 left-0 z-30 w-56 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
                  <SheetItem icon={<Paperclip size={17} />} label="Фото или файл" onClick={() => { setMoreOpen(false); fileRef.current?.click() }} />
                  <SheetItem icon={<StickerIcon size={17} />} label="Стикеры" onClick={() => { setMoreOpen(false); setStickers(true) }} />
                  <SheetItem icon={<ImagePlay size={17} />} label="GIF" onClick={() => { setMoreOpen(false); setGifs(true) }} />
                  <SheetItem icon={<ListChecks size={17} />} label="Опрос" onClick={() => { setMoreOpen(false); setPollOpen(true) }} />
                  <SheetItem
                    icon={<Clock size={17} />}
                    label="Исчезающее"
                    hint={ttl ? ttlLabel : undefined}
                    onClick={() => { setMoreOpen(false); setTtlOpen(true) }}
                  />
                </div>
              </>
            )}
          </div>

          {/*
            `no-scrollbar`: the field grows with its content up to 160px and then
            scrolls, and the bar the browser drew inside that small rounded box
            was pure noise — a fat coloured pill sitting on the border radius.
            Scrolling with the wheel, the caret and touch all still work.
          */}
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => updateText(e.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            rows={1}
            autoFocus={!isCoarsePointer()}
            placeholder={pending.length ? 'Подпись…' : 'Сообщение…'}
            className={classNames(
              'no-scrollbar max-h-40 min-w-0 flex-1 resize-none rounded-2xl border bg-[var(--panel-2)] px-3.5 py-2.5 outline-none focus:ring-2 sm:order-2 sm:px-4',
              overLimit ? 'border-rose-500 focus:ring-rose-500/40' : 'border-[var(--border)] focus:ring-[var(--ring)]',
            )}
          />

          <IconButton title="Эмодзи" className="sm:order-1" active={emoji} onClick={() => { setEmoji((v) => !v); setStickers(false); setGifs(false); setMoreOpen(false) }}>
            <Smile size={21} />
          </IconButton>

          {/* Desktop-only group: `display: none` on phones, plain flex items from `sm`. */}
          <span className="hidden sm:contents">
            <IconButton title="Стикеры" className="sm:order-1" active={stickers} onClick={() => { setStickers((v) => !v); setEmoji(false); setGifs(false) }}>
              <StickerIcon size={21} />
            </IconButton>
            <IconButton title="GIF" className="sm:order-1" active={gifs} onClick={() => { setGifs((v) => !v); setEmoji(false); setStickers(false) }}>
              <ImagePlay size={21} />
            </IconButton>
            <IconButton title="Прикрепить файл" className="sm:order-1" onClick={() => fileRef.current?.click()}>
              <Paperclip size={20} />
            </IconButton>
            <IconButton title="Исчезающее сообщение" className="sm:order-3" active={!!ttl} onClick={() => setTtlOpen((v) => !v)}>
              <Clock size={20} />
            </IconButton>
            <IconButton title="Опрос" className="sm:order-3" onClick={() => setPollOpen(true)}>
              <ListChecks size={20} />
            </IconButton>
          </span>

          {showMic ? (
            <button onClick={() => setRecording(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full accent-gradient text-white shadow-md transition hover:brightness-105 active:scale-95 sm:order-3" title="Голосовое сообщение">
              <Mic size={19} />
            </button>
          ) : (
            <button onClick={submit} disabled={sending || overLimit} className="grid h-11 w-11 shrink-0 place-items-center rounded-full accent-gradient text-white shadow-md transition hover:brightness-105 active:scale-95 disabled:opacity-60 sm:order-3" title="Отправить (Ctrl+Enter)">
              {sending ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
            </button>
          )}
        </div>
      )}

      {text.length >= COUNTER_FROM && (
        <div className={classNames('mt-1 text-right text-[11px] font-bold tabular-nums', overLimit ? 'text-rose-500' : 'text-[var(--muted)]')}>
          {text.length} / {MAX_LEN}
        </div>
      )}

      {pollOpen && <PollCreator onClose={() => setPollOpen(false)} onCreate={(p) => { send({ text: '', poll: p }); setPollOpen(false) }} />}
    </div>
  )
}

function attachmentChipLabel(a: Attachment) {
  switch (a.kind) {
    case 'image': return '📷 фото'
    case 'gif': return '🖼 GIF'
    case 'video': return '🎬 видео'
    case 'voice': return '🎤 голосовое'
    case 'audio': return '🎵 аудио'
    default: return `📎 ${a.name ?? 'файл'}`
  }
}

/** One row of the phone «➕» sheet. */
function SheetItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-[var(--panel-hover)]">
      <span className="text-[var(--accent)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-xs font-bold accent-text">{hint}</span>}
    </button>
  )
}

function IconButton({ children, onClick, title, active, className }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={classNames(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-[var(--panel-hover)]',
        active ? 'text-[var(--accent)]' : 'text-[var(--muted)]',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Thumbnail chip of a file waiting to be sent. */
function PendingChip({ file, spoiler, onRemove }: { file: File; spoiler?: boolean; onRemove: () => void }) {
  const kind = attachmentKindFor(file)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (kind !== 'image' && kind !== 'gif') return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, kind])

  return (
    <div className="relative shrink-0 animate-pop-in">
      {preview ? (
        <img src={preview} alt={file.name} className={classNames('h-16 w-16 rounded-xl border border-[var(--border)] object-cover transition', spoiler && 'blur-[6px]')} />
      ) : (
        <div className="flex h-16 w-40 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg accent-gradient text-white">
            {kind === 'video' ? <Video size={17} /> : kind === 'audio' ? <Music size={17} /> : <FileText size={17} />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{file.name}</div>
            <div className="text-[10px] text-[var(--muted)]">{prettySize(file.size)}</div>
          </div>
        </div>
      )}
      <button onClick={onRemove} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white shadow" title="Убрать">
        <X size={12} />
      </button>
    </div>
  )
}

/** Inline voice-note recorder (Telegram-style). */
function VoiceRecorder({ onDone, onCancel }: { onDone: (blob: Blob, durationSec: number) => void; onCancel: () => void }) {
  const toast = useStore((s) => s.toast)
  const [elapsed, setElapsed] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const startRef = useRef(0)

  useEffect(() => {
    let stream: MediaStream | null = null
    let tick: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        toast('Нет доступа к микрофону 🥺', '🎤')
        onCancel()
        return
      }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
      rec.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop())
        if (cancelledRef.current) return
        const durationSec = Math.round((Date.now() - startRef.current) / 1000)
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (durationSec < 1 || blob.size === 0) {
          toast('Слишком коротко — зажми и скажи что-нибудь 🎀', '🎤')
          onCancel()
          return
        }
        onDone(blob, durationSec)
      }
      startRef.current = Date.now()
      rec.start(250)
      tick = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)
    })()
    return () => {
      if (tick) clearInterval(tick)
      if (recRef.current && recRef.current.state !== 'inactive') {
        cancelledRef.current = true
        recRef.current.stop()
      }
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => { cancelledRef.current = true; recRef.current?.stop(); onCancel() }}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-rose-500 hover:bg-rose-500/10"
        title="Отменить"
      >
        <Trash2 size={20} />
      </button>
      <div className="flex flex-1 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
        <span className="text-sm font-bold tabular-nums">{mm}:{ss}</span>
        <span className="text-sm text-[var(--muted)]">Запись голосового…</span>
      </div>
      <button
        onClick={() => { cancelledRef.current = false; recRef.current?.stop() }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full accent-gradient text-white shadow-md transition hover:brightness-105 active:scale-95"
        title="Отправить"
      >
        <Send size={19} />
      </button>
    </div>
  )
}

function StickerTray({ onPick, onClose }: { onPick: (s: string) => void; onClose: () => void }) {
  const [pack, setPack] = useState(STICKER_PACKS[0].id)
  const active = STICKER_PACKS.find((p) => p.id === pack)!
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute bottom-16 left-2 z-30 w-[26rem] max-w-[calc(100vw-16px)] rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
        <div className="fancy-scroll grid max-h-64 grid-cols-4 gap-1 overflow-y-auto p-2 sm:grid-cols-5">
          {active.items.map((s) => (
            <button key={s} onClick={() => onPick(s)} className="grid aspect-square place-items-center rounded-xl transition hover:scale-105 hover:bg-[var(--panel-hover)]">
              <Sticker emoji={s} size={64} />
            </button>
          ))}
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-[var(--border)] p-1.5">
          {STICKER_PACKS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPack(p.id)}
              className={classNames('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl transition', pack === p.id ? 'bg-[var(--panel-hover)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--panel-hover)]')}
              title={p.label}
            >
              <Sticker emoji={p.cover} size={26} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/** Anime-GIF tray backed by the keyless nekos.best API. */
function GifTray({ onPick, onClose }: { onPick: (g: GifResult) => void; onClose: () => void }) {
  const [cat, setCat] = useState(GIF_CATEGORIES[0].id)
  const [items, setItems] = useState<GifResult[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    fetchGifs(cat, 12)
      .then((res) => { if (alive) { setItems(res); setState('ok') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [cat])

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute bottom-16 left-2 z-30 w-[26rem] max-w-[calc(100vw-16px)] rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
        <div className="fancy-scroll max-h-72 overflow-y-auto p-2">
          {state === 'loading' && (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="shimmer aspect-square rounded-xl bg-[var(--panel-2)]" />
              ))}
            </div>
          )}
          {state === 'error' && (
            <div className="py-8 text-center text-sm text-[var(--muted)]">GIF-сервис недоступен 🥺 Попробуй позже.</div>
          )}
          {state === 'ok' && (
            <div className="grid grid-cols-3 gap-1.5">
              {items.map((g) => (
                <button key={g.url} onClick={() => onPick(g)} className="group aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-2)]">
                  <img src={g.url} alt={g.anime ?? 'gif'} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-[var(--border)] p-1.5">
          {GIF_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              title={c.label}
              className={classNames(
                'flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition',
                cat === c.id ? 'bg-[var(--panel-hover)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--panel-hover)]',
              )}
            >
              <span>{c.emoji}</span>
              <span className="hidden sm:inline text-xs">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function PollCreator({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Poll) => void }) {
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const [multi, setMulti] = useState(false)
  const valid = q.trim() && opts.filter((o) => o.trim()).length >= 2
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(10,6,14,0.45)' }} onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-2xl animate-pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold">📊 Новый опрос</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Вопрос" className="input mb-2" />
        <div className="space-y-2">
          {opts.map((o, i) => (
            <input key={i} value={o} onChange={(e) => setOpts((a) => a.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Вариант ${i + 1}`} className="input" />
          ))}
        </div>
        <button onClick={() => setOpts((a) => [...a, ''])} className="mt-2 text-sm font-semibold accent-text">＋ Добавить вариант</button>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Несколько вариантов</label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Отмена</button>
          <button disabled={!valid} onClick={() => onCreate({ question: q.trim(), options: opts.filter((o) => o.trim()).map((t) => ({ text: t.trim(), uids: [] })), multi })} className="btn-primary disabled:opacity-50">Создать</button>
        </div>
      </div>
    </div>
  )
}
