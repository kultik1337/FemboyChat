import { useMemo } from 'react'
import type { UserSettings } from '../../types'

const SETS: Record<Exclude<UserSettings['ambient'], 'off'>, string[]> = {
  petals: ['🌸', '🌷', '🌺', '🌼', '💮'],
  snow: ['❄️', '❄', '🌨️'],
  hearts: ['💗', '💕', '🩷', '💞'],
  stars: ['✨', '⭐', '🌟', '💫'],
  bubbles: ['🫧', '🫧', '⚪'],
}

/**
 * Subtle, always-on ambient particles drifting over the chat. Purely decorative
 * (pointer-events: none) and driven by the user's appearance setting.
 */
export function Ambient({ kind }: { kind: UserSettings['ambient'] }) {
  const items = useMemo(() => {
    const set = kind && kind !== 'off' ? SETS[kind] : undefined
    if (!set) return []
    return Array.from({ length: 16 }).map((_, i) => ({
      emoji: set[i % set.length],
      left: Math.random() * 100,
      dur: 9 + Math.random() * 10,
      delay: -Math.random() * 16,
      size: 15 + Math.random() * 17,
      drift: (Math.random() * 2 - 1) * 40,
      up: kind === 'bubbles',
    }))
  }, [kind])

  if (!items.length) return null
  return (
    <div className="ambient-layer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((it, i) => (
        <span
          key={i}
          className={it.up ? 'ambient-item ambient-up' : 'ambient-item'}
          style={{
            left: `${it.left}%`,
            fontSize: it.size,
            animationDuration: `${it.dur}s`,
            animationDelay: `${it.delay}s`,
            ['--drift' as string]: `${it.drift}px`,
          }}
        >
          {it.emoji}
        </span>
      ))}
    </div>
  )
}
