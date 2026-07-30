/**
 * Web Push subscription handling.
 *
 * The server side does the hard part (VAPID signing, RFC 8291 encryption, fan-out
 * from a database trigger). All this module has to do is get permission, hand the
 * browser the VAPID public key, and store the resulting subscription.
 *
 * Everything goes through the existing backend RPC bridge, so LocalBackend (which
 * has no `rpc`) simply reports "unavailable" instead of crashing.
 */

import { useStore } from '../store/useStore'
import { deviceKey } from './device'

const HIDE_KEY = 'fc:hidePush'

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied'

export function pushSupported(): boolean {
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushState(): PushState {
	if (!pushSupported()) return 'unsupported'
	return Notification.permission as PushState
}

export function pushDismissed(): boolean {
	return localStorage.getItem(HIDE_KEY) === '1'
}

export function dismissPush(): void {
	localStorage.setItem(HIDE_KEY, '1')
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
	const backend = useStore.getState().backend
	const rpc = backend?.rpc
	if (!backend || !rpc) return null
	try {
		return (await rpc.call(backend, name, args)) as T | null
	} catch (err) {
		return null
	}
}

/** The browser wants the VAPID key as raw bytes, not as the base64url string. */
function b64urlToBytes(input: string): Uint8Array {
	const padded = (input + '='.repeat((4 - (input.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
	const raw = atob(padded)
	const out = new Uint8Array(raw.length)
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
	return out
}

function bytesToB64url(buffer: ArrayBuffer | null): string {
	if (!buffer) return ''
	const bytes = new Uint8Array(buffer)
	let raw = ''
	for (const byte of bytes) raw += String.fromCharCode(byte)
	return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** True when THIS browser already has a live subscription. */
export async function pushActiveHere(): Promise<boolean> {
	if (!pushSupported()) return false
	try {
		const registration = await navigator.serviceWorker.ready
		return (await registration.pushManager.getSubscription()) !== null
	} catch (err) {
		return false
	}
}

export type EnableResult = 'enabled' | 'denied' | 'unsupported' | 'error'

export async function enablePush(): Promise<EnableResult> {
	if (!pushSupported()) return 'unsupported'

	let permission = Notification.permission
	if (permission === 'default') permission = await Notification.requestPermission()
	if (permission !== 'granted') return 'denied'

	const vapid = await callRpc<string>('get_vapid_public_key', {})
	if (!vapid) return 'error'

	try {
		const registration = await navigator.serviceWorker.ready
		// Reuse an existing subscription when there is one: re-subscribing would
		// mint a new endpoint and leave the old row behind as a ghost.
		const subscription =
			(await registration.pushManager.getSubscription()) ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: b64urlToBytes(vapid),
			}))

		const p256dh = bytesToB64url(subscription.getKey('p256dh'))
		const auth = bytesToB64url(subscription.getKey('auth'))
		if (!p256dh || !auth) return 'error'

		const saved = await callRpc<boolean>('save_push_subscription', {
			p_endpoint: subscription.endpoint,
			p_p256dh: p256dh,
			p_auth: auth,
			p_device: deviceKey(),
			p_ua: navigator.userAgent.slice(0, 400),
		})
		return saved ? 'enabled' : 'error'
	} catch (err) {
		return 'error'
	}
}

/** Removes this device's subscription both locally and on the server. */
export async function disablePush(): Promise<boolean> {
	if (!pushSupported()) return false
	try {
		const registration = await navigator.serviceWorker.ready
		const subscription = await registration.pushManager.getSubscription()
		if (!subscription) return true
		const endpoint = subscription.endpoint
		await subscription.unsubscribe().catch(() => undefined)
		await callRpc<boolean>('delete_push_subscription', { p_endpoint: endpoint })
		return true
	} catch (err) {
		return false
	}
}

/**
 * Keeps the stored subscription fresh on every boot. Browsers silently rotate
 * endpoints, and a rotated endpoint means notifications quietly stop arriving —
 * so an already-granted user gets re-saved rather than trusted.
 */
export async function refreshPush(): Promise<void> {
	if (!pushSupported() || Notification.permission !== 'granted') return
	if (!(await pushActiveHere())) return
	await enablePush()
}
