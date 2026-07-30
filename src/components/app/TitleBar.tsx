import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../../store/useStore'
import { Logo } from '../ui/Logo'
import { APP_VERSION_LABEL } from '../../lib/version'

type WindowControlsOverlay = {
	visible: boolean
	addEventListener: (type: string, listener: () => void) => void
	removeEventListener: (type: string, listener: () => void) => void
}

function overlay(): WindowControlsOverlay | null {
	if (typeof navigator === 'undefined') return null
	const wco = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay }).windowControlsOverlay
	return wco ?? null
}

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties

export function TitleBar() {
	const [visible, setVisible] = useState<boolean>(() => overlay()?.visible ?? false)
	const unread = useStore((s) => s.unread)
	const route = useStore((s) => s.route)

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
				height: 'env(titlebar-area-height, 40px)',
				background: 'linear-gradient(100deg, var(--accent), var(--accent-2))',
				...DRAG,
			}}
		>
			<div
				className="pointer-events-none absolute inset-0"
				style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 60%)' }}
			/>
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
