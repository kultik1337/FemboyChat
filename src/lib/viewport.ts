/**
 * Keeps the app exactly as tall as the *visible* area on phones.
 *
 * `100dvh` already handles the collapsing address bar, but it deliberately
 * ignores the on-screen keyboard: when the keyboard opens, dvh stays the same
 * and the browser just scrolls the layout viewport instead. That is what left
 * the composer floating in the middle of the screen with a slab of empty space
 * underneath it. `visualViewport.height` is the only value that actually
 * shrinks with the keyboard, so it is mirrored into `--app-h` and used as the
 * app height on small screens (see src/index.css).
 */

let started = false

export function initViewport(): void {
	if (started) return
	started = true

	const vv = window.visualViewport
	// No visualViewport (older engines, most desktops) -> the CSS fallback of
	// 100dvh stays in charge, which is correct there.
	if (!vv) return

	const apply = (): void => {
		document.documentElement.style.setProperty('--app-h', `${Math.round(vv.height)}px`)
	}

	apply()
	vv.addEventListener('resize', apply)
	// Safari also lets the page slide up behind the keyboard; re-measuring on
	// scroll keeps the height honest while that happens.
	vv.addEventListener('scroll', apply)
	// Rotation reports the new size a beat late on iOS.
	window.addEventListener('orientationchange', () => {
		setTimeout(apply, 250)
	})
}
