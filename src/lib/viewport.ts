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
 * interface above the top of the screen — leaving a black page with nothing but
 * Safari's own ↑↓✓ accessory bar floating over it.
 *
 * The fix is what native apps effectively do: pin the shell to the visual
 * viewport. On phones `#root` becomes `position: fixed`, exactly as tall as the
 * visible area, offset by `visualViewport.offsetTop`, and any document scroll
 * Safari performs is undone immediately. There is then nothing left to scroll,
 * so the layout cannot run away — the composer sits on the keyboard and the
 * message list keeps the remaining space, like Telegram.
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
	 * iOS reports the new viewport a few frames late, and sometimes twice, so a
	 * single measurement after focus is unreliable. Re-measure over ~half a
	 * second instead of guessing one magic delay.
	 */
	const nudge = (): void => {
		apply()
		setTimeout(apply, 60)
		setTimeout(apply, 200)
		setTimeout(apply, 450)
	}

	apply()
	vv.addEventListener('resize', apply)
	// Safari also lets the page slide up behind the keyboard; re-measuring on
	// scroll keeps the height honest while that happens.
	vv.addEventListener('scroll', apply)
	// Opening and closing the keyboard.
	window.addEventListener('focusin', nudge)
	window.addEventListener('focusout', nudge)
	// Rotation reports the new size a beat late on iOS.
	window.addEventListener('orientationchange', () => {
		setTimeout(nudge, 250)
	})
}
