import { useState } from 'react'
import { classNames } from '../../lib/util'

export function Avatar({
  emoji,
  color,
  src,
  size = 44,
  online,
  ring,
}: {
  emoji: string
  color: string
  /** Custom uploaded avatar image; falls back to the emoji tile when missing/broken. */
  src?: string | null
  size?: number
  online?: boolean
  ring?: boolean
}) {
  const [broken, setBroken] = useState(false)
  const showImage = !!src && !broken

  // Telegram-style presence dot: only drawn when the peer is actually online.
  // Previously the offline state still rendered a bordered transparent circle,
  // which read as a weird hollow ring punched into the avatar.
  const dot = Math.round(Math.min(14, Math.max(8, size * 0.26)))
  const border = size >= 40 ? 2.5 : 2
  const inset = Math.round(size * 0.02)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {showImage ? (
        <img
          src={src!}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className={classNames(
            'rounded-full object-cover select-none',
            ring && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--panel)]',
          )}
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className={classNames(
            'grid place-items-center rounded-full text-white select-none',
            ring && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--panel)]',
          )}
          style={{
            width: size,
            height: size,
            fontSize: size * 0.5,
            background: `linear-gradient(135deg, ${color}, ${shift(color)})`,
          }}
        >
          <span>{emoji}</span>
        </div>
      )}
      {online && (
        <span
          aria-label="в сети"
          className="absolute rounded-full bg-emerald-400"
          style={{
            width: dot,
            height: dot,
            right: inset,
            bottom: inset,
            boxShadow: `0 0 0 ${border}px var(--panel)`,
          }}
        />
      )}
    </div>
  )
}

function shift(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  const r = Math.min(255, (n >> 16) + 30)
  const g = Math.min(255, ((n >> 8) & 0xff) + 10)
  const b = Math.min(255, (n & 0xff) + 40)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
