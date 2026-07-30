/**
 * Keeps the app exactly as tall as the *visible* area on phones, and keeps it
 * pinned there while the on-screen keyboard is open.
 *
 * `100dvh` already handles the collapsing address bar, but it deliberately
 * ignores the keyboard: when the keyboard opens, dvh stays the same and the
 * browser just scrolls the layout viewport instead. `visualViewport.height` is
 * the only value that actually shrinks with the keyboard, so it is mirrored
 * into `--app-h` and used as the app height on small screens (see index.css).
 *
 * That alone was not enough on iOS. Safari insists on scrolling the *document*
 * to bring a focused field into view, and since the app is one tall flex column
 * with the composer at the very bottom, tapping the input pushed the entire
 * interface above the top of the screen. So on phones `#root` is pinned to the
 * visual viewport: `position: fixed`, exactly as tall as the visible area, and
 * any document scroll Safari performs is undone immediately.
 *
 * One measurement is never enough. iOS animates the keyboard for ~300ms and
 * reports intermediate sizes along the way, so a single reading (or even four
 * timed ones) can land mid-animation and leave the shell shorter than the
 * screen -- a slab of empty page between the composer and the keyboard. The
 * shell is therefore re-measured every animation frame for a short while after
 * anything that can move the viewport, which costs nothing and always converges
 * on the final size.
 */

let started = false

/** Phones and tablets only — desktop keeps the plain document flow. */
function isTouchLayout(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false
	return window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches
}

export function initViewport(): void {
	if (started) return
	started = true

	const vv = window.visualViewport
	// No visualViewport (older engines, most desktops) -> the CSS fallback of
	// 100dvh stays in charge, which is correct there.
	if (!vv) return

	const root = document.getElementById('root')
	let pinned = false

	const unpin = (): void => {
		if (!pinned || !root) return
		pinned = false
		root.style.position = ''
		root.style.top = ''
		root.style.left = ''
		root.style.right = ''
		root.style.height = ''
		document.body.style.overflow = ''
	}

	const apply = (): void => {
		const h = Math.round(vv.height)
		document.documentElement.style.setProperty('--app-h', `${h}px`)

		if (!root) return
		if (!isTouchLayout()) {
			unpin()
			return
		}

		pinned = true
		root.style.position = 'fixed'
		// offsetTop is non-zero exactly when Safari has slid the page up behind
		// the keyboard; following it keeps the shell over the visible area even
		// in the frames before the scroll reset below lands.
		root.style.top = `${Math.round(vv.offsetTop)}px`
		root.style.left = '0'
		root.style.right = '0'
		root.style.height = `${h}px`
		// Nothing outside the shell should scroll; every scrollable area lives
		// inside it.
		document.body.style.overflow = 'hidden'

		if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0)
	}

	/**
	 * Re-measure every frame until `trackUntil`, so the shell follows the
	 * keyboard animation instead of guessing where it will end up.
	 */
	let trackUntil = 0
	let rafId = 0
	const pump = (): void => {
		apply()
		if (Date.now() < trackUntil) {
			rafId = requestAnimationFrame(pump)
		} else {
			rafId = 0
		}
	}
	const track = (ms: number): void => {
		trackUntil = Math.max(trackUntil, Date.now() + ms)
		if (!rafId) rafId = requestAnimationFrame(pump)
	}

	apply()
	// The keyboard animation is the long one; a plain resize settles fast.
	vv.addEventListener('resize', () => track(400))
	vv.addEventListener('scroll', apply)
	window.addEventListener('focusin', () => track(1200))
	window.addEventListener('focusout', () => track(1200))
	window.addEventListener('orientationchange', () => track(1200))
}
