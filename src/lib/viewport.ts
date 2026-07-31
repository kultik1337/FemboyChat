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
 * anything that can move the viewport, and for as long as a field is focused,
 * which costs nothing and always converges on the final size.
 *
 * The last source of that same slab was the home-indicator inset. The shell is
 * already only as tall as the visible area, so the `env(safe-area-inset-bottom)`
 * padding that keeps the composer off the indicator was pure dead space once
 * the keyboard covered the indicator anyway. While the keyboard is up the
 * `kb-open` class removes it.
 */

let started = false

/** Phones and tablets only — desktop keeps the plain document flow. */
function isTouchLayout(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false
	return window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches
}

/** True while the caret is in a field, i.e. while the keyboard can move. */
function isTyping(): boolean {
	const el = document.activeElement
	if (!el) return false
	const tag = el.tagName
	return tag === 'INPUT' || tag === 'TEXTAREA' || (el instanceof HTMLElement && el.isContentEditable)
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
	let lastH = -1
	let lastTop = -1

	// One rule, injected once: every safe-area consumer uses `.safe-bottom`.
	const style = document.createElement('style')
	style.textContent = 'html.kb-open .safe-bottom{padding-bottom:0 !important}'
	document.head.appendChild(style)

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
		const top = Math.round(vv.offsetTop)
		const touch = isTouchLayout()

		// A shrink of more than a finger's worth of pixels is the keyboard; the
		// address bar collapsing goes the other way.
		document.documentElement.classList.toggle('kb-open', touch && window.innerHeight - h > 120)

		if (h !== lastH) {
			lastH = h
			document.documentElement.style.setProperty('--app-h', `${h}px`)
		}

		if (!root) return
		if (!touch) {
			unpin()
			return
		}

		if (!pinned || top !== lastTop || root.style.height !== `${h}px`) {
			pinned = true
			lastTop = top
			root.style.position = 'fixed'
			// offsetTop is non-zero exactly when Safari has slid the page up behind
			// the keyboard; following it keeps the shell over the visible area even
			// in the frames before the scroll reset below lands.
			root.style.top = `${top}px`
			root.style.left = '0'
			root.style.right = '0'
			root.style.height = `${h}px`
			// Nothing outside the shell should scroll; every scrollable area lives
			// inside it.
			document.body.style.overflow = 'hidden'
		}

		if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0)
	}

	/**
	 * Re-measure every frame until `trackUntil`, so the shell follows the
	 * keyboard animation instead of guessing where it will end up. While a field
	 * is focused the deadline keeps moving: iOS resizes the viewport again when
	 * the autocomplete bar, dictation or a hardware keyboard appears, and none of
	 * those fire a resize we can trust to be the last one.
	 */
	let trackUntil = 0
	let rafId = 0
	const pump = (): void => {
		apply()
		if (isTyping()) trackUntil = Math.max(trackUntil, Date.now() + 300)
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
