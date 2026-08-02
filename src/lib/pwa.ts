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
 *
 * NONE of this applies to the installed desktop program — see initPwa() and
 * purgeServiceWorker() at the bottom of the file for why running it there was
 * actively harmful.
 */

import { isDesktopApp } from './desktop'

/** Not in TypeScript's DOM lib yet — Chrome-only, hence the local shape. */
type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Also not in the DOM lib: the modern, structured user-agent info. */
type NavigatorUAData = {
	brands?: Array<{ brand: string; version: string }>
	mobile?: boolean
}

const HIDE_KEY = 'fc:hideInstall'
const RELOAD_AT_KEY = 'fc:swReloadAt'
/** Guards the one-off reload after a desktop cache purge against a loop. */
const PURGED_KEY = 'fc:swPurged'

/** How often an open tab asks whether a newer build has been deployed. */
const UPDATE_EVERY_MS = 60_000
/** Two refreshes closer together than this are a loop, not an update. */
const RELOAD_GUARD_MS = 30_000

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

/**
 * Desktop Chromium (Chrome, Edge, Brave, Opera...). These browsers CAN install
 * the app from their own menu even when `beforeinstallprompt` never reached us,
 * which is why the banner offers written instructions there instead of giving
 * up silently. Firefox and desktop Safari have no install flow at all, so they
 * are excluded — promising them anything would be a lie.
 */
export function isChromiumDesktop(): boolean {
	const ua = navigator.userAgent
	const data = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData
	const mobile = data?.mobile ?? /Android|iPhone|iPad|iPod/i.test(ua)
	if (mobile) return false
	if (data?.brands?.length) {
		return data.brands.some((b) => /Chromium|Chrome|Edge|Opera|Brave/i.test(b.brand))
	}
	if (/Firefox\//i.test(ua)) return false
	// Safari's UA also contains "Safari" but never "Chrome".
	return /Chrome\/|Chromium\/|Edg\//i.test(ua)
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

function addLink(rel: string, href: string): void {
	if (document.querySelector('link[rel="' + rel + '"]')) return
	const el = document.createElement('link')
	el.setAttribute('rel', rel)
	el.setAttribute('href', href)
	document.head.appendChild(el)
}

function injectManifest(): void {
	if (!document.querySelector('link[rel="manifest"]')) {
		const link = document.createElement('link')
		link.rel = 'manifest'
		link.href = '/manifest.webmanifest'
		document.head.appendChild(link)
	}
	// iOS ignores the manifest icons entirely and uses this instead.
	addLink('apple-touch-icon', '/icon.png')
	addMeta('mobile-web-app-capable', 'yes')
	addMeta('apple-mobile-web-app-capable', 'yes')
	addMeta('apple-mobile-web-app-title', 'FemboyChat')
	addMeta('apple-mobile-web-app-status-bar-style', 'default')
}

/** True while the caret is in a field — refreshing now would eat what is typed. */
function isBusy(): boolean {
	const el = document.activeElement
	if (!el) return false
	const tag = el.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
	return el instanceof HTMLElement && el.isContentEditable
}

/**
 * Swap in the new build. Waiting for a calm moment is the whole point: the
 * refresh is invisible when nobody is mid-sentence, and infuriating when it
 * happens on the second half of a message.
 */
function refreshWhenSafe(): void {
	const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) ?? 0)
	if (Date.now() - last < RELOAD_GUARD_MS) return

	const go = (): void => {
		sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()))
		window.location.reload()
	}

	if (!isBusy()) {
		go()
		return
	}

	const onIdle = (): void => {
		if (isBusy()) return
		window.removeEventListener('focusout', onIdle)
		document.removeEventListener('visibilitychange', onIdle)
		go()
	}
	window.addEventListener('focusout', onIdle)
	document.addEventListener('visibilitychange', onIdle)
}

/**
 * A service worker only looks for a new version when the page loads, which is
 * why a fresh deploy used to need a manual refresh: a tab left open all day
 * never asked again. Now it asks every minute, whenever the tab is brought
 * back to the front, and whenever the connection returns — and when the answer
 * is "yes", the new worker is told to take over immediately instead of waiting
 * for every tab to close.
 */
function registerServiceWorker(): void {
	if (!('serviceWorker' in navigator)) return

	// Whether this page was already controlled decides if a controller swap means
	// "a new build arrived" (refresh) or just "first ever install" (do nothing).
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

				const check = (): void => {
					// Asking while hidden wakes the radio for nothing; the tab is
					// checked again the moment it comes back anyway.
					if (document.visibilityState !== 'visible') return
					registration.update().catch(() => undefined)
				}
				window.setInterval(check, UPDATE_EVERY_MS)
				window.addEventListener('focus', check)
				window.addEventListener('online', check)
				document.addEventListener('visibilitychange', check)
			})
			.catch(() => undefined)

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!hadController) return
			refreshWhenSafe()
		})
	}

	if (document.readyState === 'complete') start()
	else window.addEventListener('load', start, { once: true })
}

/**
 * Removes any service worker and cache left behind on this origin.
 *
 * THIS IS NOT HOUSEKEEPING, it repairs a real trap. The desktop program serves
 * the interface from `http://tauri.localhost`, which to the WebView is an
 * ordinary origin, so the service worker registered there exactly as it does in
 * a browser — and its cache lives in the WebView2 profile under %LOCALAPPDATA%,
 * NOT in the program folder. Reinstalling the app therefore never cleared it:
 * the worker kept answering with the shell and the hashed bundles it had cached
 * on first launch, so every freshly built .exe still opened a weeks-old build.
 * Offline support is also pointless here — the files are already inside the
 * .exe, which is the whole point of shipping a desktop program.
 *
 * The reload afterwards is what actually lets the new build appear, and it is
 * fired at most once per session so a failure can never turn into a boot loop.
 */
async function purgeServiceWorker(): Promise<void> {
	let removed = false

	try {
		if ('serviceWorker' in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations()
			for (const registration of registrations) {
				const gone = await registration.unregister()
				removed = removed || gone
			}
		}
	} catch (err) {
		// An origin without service workers at all: nothing to repair.
	}

	try {
		if ('caches' in window) {
			const keys = await caches.keys()
			for (const key of keys) {
				await caches.delete(key)
				removed = true
			}
		}
	} catch (err) {
		// Same: no Cache Storage, nothing to clean.
	}

	// Nothing was found, so this launch is already running the real files.
	if (!removed) return
	if (sessionStorage.getItem(PURGED_KEY) === '1') return
	sessionStorage.setItem(PURGED_KEY, '1')
	window.location.reload()
}

/**
 * Safe to call more than once; only the first call does the work.
 *
 * The install listener is attached BEFORE the manifest is injected on purpose:
 * Chrome can fire `beforeinstallprompt` as soon as it has both a manifest and
 * an active service worker, and an event that fires before the listener exists
 * is lost for good -- which is exactly how the banner went missing on desktop.
 *
 * In the installed desktop program every single thing in here is wrong: there
 * is no browser to install into, no manifest to read it, and the service worker
 * only ever served stale files. So it is not started at all there — instead any
 * worker left over from an earlier build is removed.
 */
export function initPwa(): void {
	if (started) return
	started = true

	if (isDesktopApp()) {
		void purgeServiceWorker()
		return
	}

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

	injectManifest()
	registerServiceWorker()
}
