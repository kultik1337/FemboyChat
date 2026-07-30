import { useEffect, useState } from 'react'
import { Download, Plus, Share2, X } from 'lucide-react'
import { canInstall, dismissInstall, installDismissed, isIos, isStandalone, onInstallChange, promptInstall } from '../../lib/pwa'

/**
 * A one-line invitation to install the app, shown at the bottom of the screen.
 *
 * Two very different flows hide behind one banner:
 *  - Chromium: the browser handed us a real install event, so one tap installs.
 *  - iOS Safari: no such event exists, so the banner explains the Share ->
 *    "На экран «Домой»" route instead of pretending there is a button.
 *
 * Dismissal is remembered, and the banner never appears once the app is already
 * running standalone.
 */
export function InstallPrompt() {
	const [, bump] = useState(0)
	const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches)

	useEffect(() => onInstallChange(() => bump((n) => n + 1)), [])

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 767px)')
		const onChange = () => setNarrow(mq.matches)
		mq.addEventListener('change', onChange)
		return () => mq.removeEventListener('change', onChange)
	}, [])

	if (isStandalone() || installDismissed()) return null

	const ios = isIos()
	const native = canInstall()
	// The iOS hint is only worth the screen space on a phone-sized screen.
	if (!native && !(ios && narrow)) return null

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
			<div className="glass pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-[var(--border)] px-3 py-2.5 shadow-xl">
				<div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl accent-gradient text-white">
					<Download size={17} />
				</div>
				<div className="min-w-0 flex-1 text-xs leading-snug">
					<div className="font-bold text-[var(--text)]">Установить FemboyChat</div>
					{native ? (
						<div className="text-[var(--muted)]">Отдельное окно, иконка на экране, работает быстрее</div>
					) : (
						<div className="flex flex-wrap items-center gap-1 text-[var(--muted)]">
							<span>Нажми</span>
							<Share2 size={13} className="inline-block" />
							<span>, затем</span>
							<Plus size={13} className="inline-block" />
							<span className="font-semibold text-[var(--text)]">На экран «Домой»</span>
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
