import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { dismissPush, enablePush, pushDismissed, pushState } from '../../lib/push'
import { canInstall, installDismissed, isStandalone } from '../../lib/pwa'

/**
 * Asks for notification permission at a moment when it makes sense, instead of
 * firing the browser prompt at page load (which browsers increasingly block and
 * users reflexively deny).
 *
 * Hidden when: not signed in, permission already decided, dismissed once, or the
 * install banner is currently occupying the same spot.
 */
export function PushPrompt() {
	const account = useStore((s) => s.account)
	const toast = useStore((s) => s.toast)
	const [hidden, setHidden] = useState(() => pushDismissed())
	const [busy, setBusy] = useState(false)
	const [state, setState] = useState(() => pushState())

	// Permission can be changed from browser UI while the app is open.
	useEffect(() => {
		const onVisible = () => setState(pushState())
		document.addEventListener('visibilitychange', onVisible)
		return () => document.removeEventListener('visibilitychange', onVisible)
	}, [])

	const installBannerVisible = !isStandalone() && !installDismissed() && canInstall()
	if (!account || hidden || state !== 'default' || installBannerVisible) return null

	async function turnOn() {
		setBusy(true)
		const result = await enablePush()
		setBusy(false)
		setState(pushState())
		if (result === 'enabled') {
			toast('Уведомления включены на этом устройстве', '🔔')
			setHidden(true)
			return
		}
		if (result === 'denied') {
			toast('Браузер запретил уведомления — разреши их в настройках сайта', '🙊')
			setHidden(true)
			return
		}
		if (result === 'unsupported') {
			toast('Этот браузер не умеет пуш-уведомления', '😢')
			setHidden(true)
			return
		}
		toast('Не удалось включить уведомления, попробуй ещё раз', '⚠️')
	}

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
			<div className="glass pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-[var(--border)] px-3 py-2.5 shadow-xl">
				<div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl accent-gradient text-white">
					<Bell size={17} />
				</div>
				<div className="min-w-0 flex-1 text-xs leading-snug">
					<div className="font-bold text-[var(--text)]">Включить уведомления?</div>
					<div className="text-[var(--muted)]">Узнаешь о новых сообщениях, даже когда вкладка закрыта</div>
				</div>
				<button
					onClick={() => void turnOn()}
					disabled={busy}
					className="shrink-0 rounded-xl accent-gradient px-3 py-2 text-xs font-bold text-white shadow disabled:opacity-70"
				>
					{busy ? '…' : 'Включить'}
				</button>
				<button
					onClick={() => {
						dismissPush()
						setHidden(true)
					}}
					aria-label="Потом"
					className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]"
				>
					<X size={14} />
				</button>
			</div>
		</div>
	)
}
