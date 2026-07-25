import { useEffect, useMemo, useRef, useState } from 'react'
import { classNames } from '../../lib/util'

const CATEGORIES: { id: string; icon: string; label: string; items: string }[] = [
  {
    id: 'smileys', icon: '😊', label: 'Смайлы',
    items: '😀 😃 😄 😁 😆 😅 😂 🤣 🙂 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤗 🤭 🫢 🤫 🤔 🫡 🤐 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖',
  },
  {
    id: 'hearts', icon: '💖', label: 'Сердечки',
    items: '❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🖤 🩶 🤍 🤎 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 😻 💋 🫀 🫶 💌',
  },
  {
    id: 'gestures', icon: '👋', label: 'Жесты',
    items: '👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫂 👐 🤲 🤝 🙏 💅 🤳 💪',
  },
  {
    id: 'animals', icon: '🐾', label: 'Зверята',
    items: '🐶 🐱 🐈 🐈‍⬛ 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦑 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐾',
  },
  {
    id: 'food', icon: '🍓', label: 'Вкусняшки',
    items: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🍞 🥐 🥨 🥞 🧇 🧀 🍗 🍔 🍟 🍕 🌭 🌮 🍣 🍜 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🍵 🧋 🧃',
  },
  {
    id: 'activity', icon: '🎀', label: 'Милота',
    items: '🎀 🌸 🌷 🌹 🌺 🌻 🌼 💐 🍥 🧸 🪆 🎠 🎡 🎢 🎨 🎭 🎪 🎮 🕹️ 🎧 🎤 🎵 🎶 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 🧩 🪄 🎯 🎳 🛼 ⛸️ 🩰 👗 👠 🧦 👑 💍 💄 👛 🕶️ 🪩',
  },
  {
    id: 'nature', icon: '🌙', label: 'Природа',
    items: '🌙 🌛 🌜 🌚 🌝 🌞 ⭐ 🌟 💫 ✨ ⚡ ☄️ 💥 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ ⛄ 🌊 💧 🫧 🌍 🪐 🌌 🎇 🎆 🌠',
  },
  {
    id: 'objects', icon: '💻', label: 'Штуки',
    items: '💻 🖥️ 📱 ⌚ 📷 📸 🎥 📺 📻 ⏰ 🕯️ 💡 🔦 📚 📖 ✏️ 🖊️ 📝 💼 📦 🎁 🎈 🎉 🎊 🪅 💎 🔮 🧿 🪬 🗝️ 🔒 ❓ ❗ 💯 ✅ ❌ 💤 💬 💭 🚀 ✈️ 🚗 🏠 🏳️‍🌈 🏳️‍⚧️',
  },
]

const RECENT_KEY = 'fc:recentEmoji'

function readRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}
function pushRecent(e: string) {
  const next = [e, ...readRecents().filter((x) => x !== e)].slice(0, 24)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** Inline emoji grid with categories + recents. Reused by the popover picker and the settings avatar editor. */
export function EmojiGrid({ onPick, compact }: { onPick: (e: string) => void; compact?: boolean }) {
  const [cat, setCat] = useState<string>('smileys')
  const [recents, setRecents] = useState<string[]>(readRecents)

  const tabs = useMemo(() => {
    const base = CATEGORIES.map((c) => ({ id: c.id, icon: c.icon, label: c.label }))
    return recents.length ? [{ id: 'recent', icon: '🕓', label: 'Недавние' }, ...base] : base
  }, [recents.length])

  const items = useMemo(() => {
    if (cat === 'recent') return recents
    const c = CATEGORIES.find((x) => x.id === cat) ?? CATEGORIES[0]
    return c.items.split(' ').filter(Boolean)
  }, [cat, recents])

  function pick(e: string) {
    pushRecent(e)
    setRecents(readRecents())
    onPick(e)
  }

  return (
    <div>
      <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setCat(t.id)}
            title={t.label}
            className={classNames(
              'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg transition',
              cat === t.id ? 'bg-[var(--panel-hover)] ring-1 ring-[var(--accent)]' : 'hover:bg-[var(--panel-hover)]',
            )}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <div className={classNames('fancy-scroll grid gap-0.5 overflow-y-auto', compact ? 'max-h-40 grid-cols-8' : 'max-h-56 grid-cols-8')}>
        {items.map((e, i) => (
          <button
            key={`${e}-${i}`}
            onClick={() => pick(e)}
            className="grid h-8 w-8 place-items-center rounded-lg text-xl transition hover:scale-110 hover:bg-[var(--panel-hover)]"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Floating emoji popover for the composer. */
export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', onDown))
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-14 left-2 z-30 w-80 max-w-[calc(100vw-16px)] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-xl animate-pop-in"
      style={{ boxShadow: 'var(--shadow)' }}
    >
      <EmojiGrid onPick={onPick} />
    </div>
  )
}
