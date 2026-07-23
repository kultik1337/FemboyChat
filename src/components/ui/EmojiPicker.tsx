import { useEffect, useRef } from 'react'

const EMOJIS =
  '😀 😁 😂 🤣 😊 😍 🥰 😘 😳 🙈 🥺 😢 😭 😴 🤔 😎 🤗 🫶 🙌 👍 👎 👏 🔥 ✨ ⭐ 💫 🌈 🎀 🌸 🌷 🌹 🍓 🍰 🧁 🍭 🐾 🐱 🐈 🦊 🐰 🐻 🧸 💖 💗 💓 💕 💜 💙 💚 🖤 🤍 💅 🧦 👗 👠 🎧 🎮 💻 📱 🍥 🌙 ⚡ 🫧'
    .split(' ')
    .filter(Boolean)

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
      className="absolute bottom-14 left-2 z-30 w-72 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-xl animate-pop-in"
      style={{ boxShadow: 'var(--shadow)' }}
    >
      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
        {EMOJIS.map((e, i) => (
          <button
            key={i}
            onClick={() => onPick(e)}
            className="grid h-8 w-8 place-items-center rounded-lg text-xl hover:bg-[var(--panel-hover)]"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
