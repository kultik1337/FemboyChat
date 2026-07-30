import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { Logo } from '../ui/Logo'
import { APP_VERSION_LABEL } from '../../lib/version'

/**
 * Custom window title bar for the installed desktop app.
 *
 * How this works: the manifest asks for `window-controls-overlay`, which makes
 * the OS drop its own grey title bar and leave only the minimise/maximise/close
 * buttons floating over our page. The page then owns that whole strip, so we
 * draw this bar there instead. The `env(titlebar-area-*)` variables describe the
 * space the buttons did NOT take, and they are the only reliable way to know it:
 * the buttons sit on the left on macOS and on the right on Windows, and their
 * width differs per platform, so hardcoding a padding would eventually put our
 * logo underneath the close button.
 *
 * `-webkit-app-region: drag` is what makes the strip behave like a real title
 * bar — dragging moves the window and a double-click maximises it. Anything
 * clickable placed in here must opt out with `no-drag`, otherwise the drag
 * swallows the click.
 *
 * Everything degrades cleanly: in a browser tab, or on a phone, or in an OS that
 * refuses the overlay, `visible` is false and this renders nothing, leaving the
 * previous layout untouched.
 */

type WindowControlsOverlay = {
	visible: boolean
	addEventListener: (type: string, listener: () => void) => void
	removeEventListener: (type: string, listener: () => void) => void
}

/** Not in the DOM typings yet, hence the hand-written shape above. */
function overlay(): WindowControlsOverlay | null {
	if (typeof navigator === 'undefined') return null
	const wco = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay }).windowControlsOverlay
	return wco ?? null
}

// React's CSSProperties has no app-region, so these are cast once here rather
// than sprinkling casts through the markup.
const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties

export function TitleBar() {
	const [visible, setVisible] = useState<boolean>(() => overlay()?.visible ?? false)
	const unread = useStore((s) => s.unread)
	const route = useStore((s) => s.route)

	// The overlay disappears while the window is fullscreen and comes back after,
	// so its visibility has to be tracked rather than read once.
	useEffect(() => {
		const wco = overlay()
		if (!wco) return
		const onGeometry = () => setVisible(wco.visible)
		wco.addEventListener('geometrychange', onGeometry)
		return () => wco.removeEventListener('geometrychange', onGeometry)
	}, [])

	if (!visible) return null

	const total = Object.values(unread).reduce((a, b) => a + b, 0)

	return (
		<div
			className="relative z-50 flex shrink-0 select-none items-center overflow-hidden text-white"
			style={{
				// The strip is exactly as tall as the OS buttons, so nothing overlaps.
				height: 'env(titlebar-area-height, 40px)',
				background: 'linear-gradient(100deg, var(--accent), var(--accent-2))',
				...DRAG,
			}}
		>
			{/* Soft sheen so a flat gradient does not look like a coloured slab. */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 60%)' }}
			/>
			{/* Inner row is confined to the area the window buttons left free. */}
			<div
				className="relative flex h-full min-w-0 items-center gap-2 px-3"
				style={{ marginLeft: 'env(titlebar-area-x, 0px)', width: 'env(titlebar-area-width, 100%)' }}
			>
				<Logo size={22} className="!rounded-md !shadow-none" />
				<span className="truncate text-[13px] font-extrabold tracking-tight drop-shadow-sm">FemboyChat</span>
				<span className="emoji text-[13px]">🎀</span>
				<span className="hidden truncate text-[11px] font-medium text-white/70 sm:inline">тёплый мессенджер</span>

				{route === 'app' && total > 0 && (
					<span className="ml-1 shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold tabular-nums backdrop-blur">
						{total > 99 ? '99+' : total} новых
					</span>
				)}

				<span className="ml-auto shrink-0 pl-2 text-[10px] font-semibold text-white/60">{APP_VERSION_LABEL}</span>
			</div>
		</div>
	)
}
