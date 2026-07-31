/**
 * Long press = right click, on phones.
 *
 * Every action in the app lives in one context menu: reactions and reply on a
 * message, mute/pin/leave on a chat row, the member actions in the right
 * panel. On a desktop they are one right click away; on a phone there was no
 * way to reach any of them, because the only opener was `onContextMenu`, which
 * mobile browsers never fire on their own.
 *
 * Rather than teaching every component a touch gesture (and re-implementing
 * the cancel rules three times), the gesture is recognised once at the
 * document level and replayed as a real `contextmenu` event on the element
 * under the finger. Anything that already has a menu on desktop gets the same
 * menu on a phone for free -- including everything added later.
 *
 * The rules match what people already expect from the platform:
 * - ~450ms of holding still; moving more than a few pixels means scrolling or
 *   swiping (swipe-to-reply lives in the same touch stream) and cancels it;
 * - a short buzz when the menu appears, so the finger knows it worked;
 * - the click that follows the release is swallowed, otherwise the element
 *   under the menu would also be activated;
 * - inputs are left alone -- there the system long press places the caret and
 *   offers paste, which is the right behaviour.
 */

const DELAY_MS = 450
const SLOP_PX = 10
/** How long after opening a menu a stray click is still the gesture's fault. */
const GHOST_CLICK_MS = 700

let started = false

function isCoarsePointer(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false
	return window.matchMedia('(pointer: coarse)').matches
}

/** Fields, and anything that opted out, keep the native long press. */
function isExcluded(el: Element | null): boolean {
	for (let n: Element | null = el; n; n = n.parentElement) {
		const tag = n.tagName
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
		if (n instanceof HTMLElement && n.isContentEditable) return true
		if (n.hasAttribute('data-no-longpress')) return true
	}
	return false
}

export function initTouchContextMenu(): void {
	if (typeof window === 'undefined' || started) return
	if (!isCoarsePointer()) return
	started = true

	// Without this iOS answers a long press with its own "Copy / Look Up" bubble
	// on top of ours. Text selection itself is left working.
	const root = document.getElementById('root')
	root?.style.setProperty('-webkit-touch-callout', 'none')

	let timer = 0
	let point: { x: number; y: number; target: Element } | null = null
	let firedAt = 0

	const cancel = (): void => {
		if (timer) window.clearTimeout(timer)
		timer = 0
		point = null
	}

	const fire = (): void => {
		const p = point
		cancel()
		if (!p || !p.target.isConnected) return
		firedAt = Date.now()
		navigator.vibrate?.(12)
		// A half-started selection under the menu looks broken.
		window.getSelection()?.removeAllRanges()
		p.target.dispatchEvent(
			new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				view: window,
				clientX: p.x,
				clientY: p.y,
			}),
		)
	}

	document.addEventListener(
		'touchstart',
		(e) => {
			cancel()
			if (e.touches.length !== 1) return
			const t = e.touches[0]
			const target = t.target as Element | null
			if (!target || isExcluded(target)) return
			point = { x: t.clientX, y: t.clientY, target }
			timer = window.setTimeout(fire, DELAY_MS)
		},
		{ passive: true },
	)

	document.addEventListener(
		'touchmove',
		(e) => {
			const p = point
			if (!p || e.touches.length !== 1) return
			const t = e.touches[0]
			if (Math.abs(t.clientX - p.x) > SLOP_PX || Math.abs(t.clientY - p.y) > SLOP_PX) cancel()
		},
		{ passive: true },
	)

	document.addEventListener('touchend', cancel, { passive: true })
	document.addEventListener('touchcancel', cancel, { passive: true })
	// Momentum scrolling can carry the page away without another touch event.
	document.addEventListener('scroll', cancel, { passive: true, capture: true })

	document.addEventListener(
		'click',
		(e) => {
			if (!firedAt || Date.now() - firedAt > GHOST_CLICK_MS) return
			firedAt = 0
			e.preventDefault()
			e.stopPropagation()
		},
		true,
	)
}
