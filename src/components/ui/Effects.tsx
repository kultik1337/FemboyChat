import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'

/**
 * Full-screen celebration effects, like the ones Telegram fires for 🎉 and 🎂.
 *
 * Deliberately global and passive: it listens to the store rather than being
 * wired into the message components, so an effect plays in whatever chat the
 * message lands in — direct, group or channel — without any of those views
 * knowing this exists.
 *
 * Two details worth keeping:
 *  - The first store update only primes the "already seen" set. Without that,
 *    opening a chat whose history happens to contain 🎉 would fire the effect on
 *    every single load.
 *  - Everything is skipped for people who asked the OS to reduce motion. A
 *    screenful of spinning emoji is exactly what that setting exists for.
 */

type Effect = {
	id: string
	emoji: string
	/** Emoji that rain down; a mix reads better than one repeated glyph. */
	cast: string[]
}

/** Trigger glyph -> the little cast of emoji that falls when it is sent. */
const TRIGGERS: Array<{ match: RegExp; cast: string[] }> = [
	{ match: /🎉|🎊/u, cast: ['🎉', '🎊', '✨', '🥳', '🎈'] },
	{ match: /🥳/u, cast: ['🥳', '🎉', '🎈', '✨'] },
	{ match: /🎂|с\s*днём\s*рождения|с\s*днем\s*рождения/iu, cast: ['🎂', '🥳', '🎈', '✨', '🎁'] },
	{ match: /❤️|💖|💞|💕/u, cast: ['❤️', '💖', '💞', '💗', '🎀'] },
	{ match: /🔥/u, cast: ['🔥', '✨', '💫'] },
	{ match: /❄️|🌨/u, cast: ['❄️', '☁️', '💨'] },
	{ match: /🎀/u, cast: ['🎀', '💖', '✨'] },
]

/** How many glyphs make up one burst. Enough to fill the screen, cheap to run. */
const PIECES = 26

/** Longest a burst can stay on screen before it is removed from the DOM. */
const LIFETIME_MS = 4200

function castFor(text: string): string[] | null {
	if (!text) return null
	for (const t of TRIGGERS) if (t.match.test(text)) return t.cast
	return null
}

function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Effects() {
	const [effects, setEffects] = useState<Effect[]>([])

	useEffect(() => {
		if (prefersReducedMotion()) return

		const seen = new Set<string>()
		let primed = false

		// Subscribing to the store directly rather than selecting state keeps this
		// component out of the render path: it only re-renders when a burst starts.
		const unsub = useStore.subscribe((state, prev) => {
			if (state.messages === prev.messages) return

			const fresh: string[] = []
			for (const list of Object.values(state.messages)) {
				if (!list || list.length === 0) continue
				// Only the tail of each chat can be new, and checking a couple of
				// entries covers a burst arriving in the same tick.
				for (const m of list.slice(-3)) {
					if (!m || seen.has(m.id)) continue
					seen.add(m.id)
					if (!m.deleted && m.text) fresh.push(m.text)
				}
			}

			// The first pass is history, not news.
			if (!primed) {
				primed = true
				return
			}
			if (fresh.length === 0) return

			// One burst per tick even if several qualifying messages land together.
			for (const text of fresh) {
				const cast = castFor(text)
				if (!cast) continue
				const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
				setEffects((cur) => (cur.length >= 2 ? cur : [...cur, { id, emoji: cast[0], cast }]))
				setTimeout(() => setEffects((cur) => cur.filter((e) => e.id !== id)), LIFETIME_MS)
				break
			}
		})

		return unsub
	}, [])

	if (effects.length === 0) return null

	return (
		<div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
			<style>{`
@keyframes fc-fall {
  0%   { transform: translate3d(0, -12vh, 0) rotate(0deg) scale(var(--fc-scale, 1)); opacity: 0; }
  10%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { transform: translate3d(var(--fc-drift, 0px), 112vh, 0) rotate(var(--fc-spin, 360deg)) scale(var(--fc-scale, 1)); opacity: 0; }
}
.fc-piece {
  position: absolute;
  top: 0;
  will-change: transform, opacity;
  animation-name: fc-fall;
  animation-timing-function: cubic-bezier(.25,.6,.4,1);
  animation-fill-mode: both;
}
`}</style>
			{effects.map((effect) =>
				Array.from({ length: PIECES }).map((_, i) => {
					// Deterministic-ish spread: even columns with a random nudge, so the
					// screen fills evenly instead of clumping in one place.
					const left = (i / PIECES) * 100 + (Math.random() * 6 - 3)
					const glyph = effect.cast[i % effect.cast.length]
					return (
						<span
							key={`${effect.id}-${i}`}
							className="fc-piece emoji"
							style={{
								left: `${Math.max(0, Math.min(98, left))}%`,
								fontSize: `${18 + Math.random() * 20}px`,
								animationDuration: `${2200 + Math.random() * 1600}ms`,
								animationDelay: `${Math.random() * 500}ms`,
								['--fc-drift' as string]: `${Math.random() * 120 - 60}px`,
								['--fc-spin' as string]: `${Math.random() * 720 - 360}deg`,
								['--fc-scale' as string]: `${0.8 + Math.random() * 0.5}`,
							}}
						>
							{glyph}
						</span>
					)
				}),
			)}
		</div>
	)
}
