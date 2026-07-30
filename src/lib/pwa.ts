/**
 * Everything the browser needs to treat FemboyChat as an installable app:
 * the manifest link, the Apple meta tags, the service worker and the state
 * behind the install banner.
 *
 * Why the manifest <link> is injected from here instead of living in
 * index.html: index.html is the Vite entry and also carries the Google Fonts
 * links, so every edit to it is a chance to break font loading. Chrome (and
 * Edge/Samsung Internet) re-read the manifest when the link element appears in
 * <head>, so installability is unaffected by injecting it at boot.
 */

/** Not in TypeScript's DOM lib yet — Chrome-only, hence the local shape. */
type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const HIDE_KEY = 'fc:hideInstall'
const RELOADED_KEY = 'fc:swReloaded'

let deferredPrompt: BeforeInstallPromptEvent | null = null
let started = false
const listeners = new Set<() => void>()

function notify(): void {
	listeners.forEach((fn) => fn())
}

/** Subscribe to install-availability changes. Returns an unsubscribe function. */
export function onInstallChange(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

/** True when the app is already running as an installed app. */
export function isStandalone(): boolean {
	const nav = navigator as Navigator & { standalone?: boolean }
	return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

/** iOS never fires beforeinstallprompt, so it needs a written hint instead. */
export function isIos(): boolean {
	const ua = navigator.userAgent
	if (/iPhone|iPad|iPod/i.test(ua)) return true
	// iPadOS reports itself as a Mac; touch points give it away.
	return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function canInstall(): boolean {
	return deferredPrompt !== null
}

export function installDismissed(): boolean {
	return localStorage.getItem(HIDE_KEY) === '1'
}

export function dismissInstall(): void {
	localStorage.setItem(HIDE_KEY, '1')
	notify()
}

/**
 * Shows the native install dialog. The saved event can only be used once, so it
 * is dropped immediately whatever the user answers.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
	const event = deferredPrompt
	if (!event) return 'unavailable'
	deferredPrompt = null
	notify()
	try {
		await event.prompt()
		const { outcome } = await event.userChoice
		if (outcome === 'accepted') localStorage.setItem(HIDE_KEY, '1')
		return outcome
	} catch (err) {
		return 'unavailable'
	}
}

function addMeta(name: string, content: string): void {
	if (document.querySelector('meta[name="' + name + '"]')) return
	const el = document.createElement('meta')
	el.setAttribute('name', name)
	el.setAttribute('content', content)
	document.head.appendChild(el)
}

function injectManifest(): void {
	if (!document.querySelector('link[rel="manifest"]')) {
		const link = document.createElement('link')
		link.rel = 'manifest'
		link.href = '/manifest.webmanifest'
		document.head.appendChild(link)
	}
	addMeta('mobile-web-app-capable', 'yes')
	addMeta('apple-mobile-web-app-capable', 'yes')
	addMeta('apple-mobile-web-app-title', 'FemboyChat')
	addMeta('apple-mobile-web-app-status-bar-style', 'default')
}

function registerServiceWorker(): void {
	if (!('serviceWorker' in navigator)) return

	// Whether this page was already controlled decides if a controller swap means
	// "a new build arrived" (reload) or just "first ever install" (do nothing).
	const hadController = navigator.serviceWorker.controller !== null

	const takeOver = (worker: ServiceWorker | null): void => {
		if (worker) worker.postMessage({ type: 'SKIP_WAITING' })
	}

	const start = (): void => {
		navigator.serviceWorker
			.register('/sw.js', { updateViaCache: 'none' })
			.then((registration) => {
				if (registration.waiting && hadController) takeOver(registration.waiting)
				registration.addEventListener('updatefound', () => {
					const installing = registration.installing
					if (!installing) return
					installing.addEventListener('statechange', () => {
						if (installing.state === 'installed' && hadController) takeOver(registration.waiting)
					})
				})
			})
			.catch(() => undefined)

		// A fresh Cloudflare build should land without the user hunting for
		// Ctrl+Shift+R. sessionStorage guards against a reload loop.
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!hadController) return
			if (sessionStorage.getItem(RELOADED_KEY) === '1') return
			sessionStorage.setItem(RELOADED_KEY, '1')
			window.location.reload()
		})
	}

	if (document.readyState === 'complete') start()
	else window.addEventListener('load', start, { once: true })
}

/** Safe to call more than once; only the first call does the work. */
export function initPwa(): void {
	if (started) return
	started = true

	injectManifest()
	registerServiceWorker()

	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault()
		deferredPrompt = event as BeforeInstallPromptEvent
		notify()
	})
	window.addEventListener('appinstalled', () => {
		deferredPrompt = null
		localStorage.setItem(HIDE_KEY, '1')
		notify()
	})
}
