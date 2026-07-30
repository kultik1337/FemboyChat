import { useEffect, useState } from 'react'
import { Download, MoreVertical, Plus, Share2, X } from 'lucide-react'
import {
	canInstall,
	dismissInstall,
	installDismissed,
	isChromiumDesktop,
	isIos,
	isStandalone,
	onInstallChange,
	promptInstall,
} from '../../lib/pwa'

/** How long to wait for Chrome's install event before falling back to a hint. */
const HINT_DELAY_MS = 2500

/**
 * A one-line invitation to install the app, shown at the bottom of the screen.
 *
 * Three different flows hide behind one banner:
 *  - Chromium with the install event: one tap installs.
 *  - Desktop Chromium without it: the browser can still install from its own
 *    menu, so the banner points there rather than disappearing (that silence is
 *    why the banner looked broken on PC).
 *  - iOS Safari: no install event exists at all, so it explains the Share ->
 *    "На экран «Домой»" route instead of pretending there is a button.
 *
 * Dismissal is remembered, and the banner never appears once the app is already
 * running standalone.
 */
export function InstallPrompt() {
	const [, bump] = useState(0)
	const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches)
	const [hintReady, setHintReady] = useState(false)

	useEffect(() => onInstallChange(() => bump((n) => n + 1)), [])

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 767px)')
		const onChange = () => setNarrow(mq.matches)
		mq.addEventListener('change', onChange)
		return () => mq.removeEventListener('change', onChange)
	}, [])

	// The written fallback waits a moment: if the real event is coming, the
	// one-tap button should win instead of flashing instructions first.
	useEffect(() => {
		const t = setTimeout(() => setHintReady(true), HINT_DELAY_MS)
		return () => clearTimeout(t)
	}, [])

	if (isStandalone() || installDismissed()) return null

	const native = canInstall()
	const iosHint = !native && isIos() && narrow
	const desktopHint = !native && !isIos() && hintReady && isChromiumDesktop()
	if (!native && !iosHint && !desktopHint) return null

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
			<div className="glass pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-[var(--border)] px-3 py-2.5 shadow-xl">
				<div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl accent-gradient text-white">
					<Download size={17} />
				</div>
				<div className="min-w-0 flex-1 text-xs leading-snug">
					<div className="font-bold text-[var(--text)]">Установить FemboyChat</div>
					{native && <div className="text-[var(--muted)]">Отдельное окно, иконка на экране, работает быстрее</div>}
					{iosHint && (
						<div className="flex flex-wrap items-center gap-1 text-[var(--muted)]">
							<span>Нажми</span>
							<Share2 size={13} className="inline-block" />
							<span>, затем</span>
							<Plus size={13} className="inline-block" />
							<span className="font-semibold text-[var(--text)]">На экран «Домой»</span>
						</div>
					)}
					{desktopHint && (
						<div className="flex flex-wrap items-center gap-1 text-[var(--muted)]">
							<span>Меню браузера</span>
							<MoreVertical size={13} className="inline-block" />
							<span>→</span>
							<span className="font-semibold text-[var(--text)]">Установить приложение</span>
							<span>(или иконка установки в адресной строке)</span>
						</div>
					)}
				</div>
				{native && (
					<button onClick={() => void promptInstall()} className="shrink-0 rounded-xl accent-gradient px-3 py-2 text-xs font-bold text-white shadow">
						Установить
					</button>
				)}
				<button
					onClick={dismissInstall}
					aria-label="Скрыть"
					className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]"
				>
					<X size={14} />
				</button>
			</div>
		</div>
	)
}
