import { useStore } from '../../store/useStore'
import type { EffectKind } from '../../lib/commands'

const SETS: Record<EffectKind, string[]> = {
  confetti: ['🎉', '🎊', '✨', '🎈', '💖', '⭐', '🌸', '💜', '🩷'],
  hearts: ['❤️', '💗', '💓', '💕', '💞', '💖', '🩷', '😍', '🥰'],
  stars: ['✨', '🌟', '💫', '⭐', '🌠'],
}

/** Short-lived full-screen burst of falling emoji (Telegram-style message effects). */
export function EffectsLayer() {
  const effect = useStore((s) => s.effect)
  if (!effect) return null
  const emojis = SETS[effect.kind]
  const count = 30
  return (
    <div key={effect.id} className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const left = Math.random() * 100
        const dur = 1.7 + Math.random() * 1.3
        const delay = Math.random() * 0.45
        const size = 16 + Math.random() * 26
        const drift = (Math.random() * 2 - 1) * 90
        const spin = (Math.random() * 2 - 1) * 540
        return (
          <span
            key={i}
            className="fx-particle"
            style={{
              left: `${left}%`,
              fontSize: size,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
              ['--drift' as string]: `${drift}px`,
              ['--spin' as string]: `${spin}deg`,
            }}
          >
            {emojis[i % emojis.length]}
          </span>
        )
      })}
    </div>
  )
}
