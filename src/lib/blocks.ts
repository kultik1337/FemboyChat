/**
 * Who the current user has blocked.
 *
 * This lives outside the zustand store on purpose: it is a flat set of ids that
 * is read while building context menus (a synchronous code path) and written
 * from exactly two places, so a full slice would be more ceremony than value.
 *
 * The list is fetched once per session through the `my_blocks` RPC. In demo
 * mode there is no server, `backend.rpc` is undefined, and every call below
 * quietly reports failure instead of pretending the block was saved.
 */
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

let blocked: ReadonlySet<string> = new Set<string>()
let loaded = false
let inflight: Promise<void> | null = null

const listeners = new Set<(next: ReadonlySet<string>) => void>()

function publish(next: ReadonlySet<string>): void {
	blocked = next
	for (const listener of listeners) listener(blocked)
}

async function load(): Promise<void> {
	const backend = useStore.getState().backend
	const rows = await backend?.rpc?.('my_blocks')
	if (!Array.isArray(rows)) return
	loaded = true
	publish(new Set(rows.map((row) => String((row as { blocked_uid: string }).blocked_uid))))
}

/** Fetches the list at most once; safe to call from a render path. */
export function ensureBlocksLoaded(): void {
	if (loaded || inflight) return
	inflight = load().finally(() => {
		inflight = null
	})
}

export function isBlocked(uid: string): boolean {
	return blocked.has(uid)
}

/**
 * Blocks or unblocks someone.
 *
 * @returns false when the server refused or is simply not there (demo mode),
 * so the caller can say so instead of showing a success toast for nothing.
 */
export async function setBlocked(uid: string, next: boolean): Promise<boolean> {
	const backend = useStore.getState().backend
	const ok = await backend?.rpc?.(next ? 'block_user' : 'unblock_user', { target: uid })
	if (!ok) return false

	const updated = new Set(blocked)
	if (next) updated.add(uid)
	else updated.delete(uid)
	publish(updated)
	return true
}

/** Re-renders the component whenever the block list changes. */
export function useBlocks(): ReadonlySet<string> {
	const [snapshot, setSnapshot] = useState(blocked)

	useEffect(() => {
		ensureBlocksLoaded()
		const listener = (next: ReadonlySet<string>) => setSnapshot(next)
		listeners.add(listener)
		// A load that finished between the first render and this effect would
		// otherwise be missed entirely.
		if (snapshot !== blocked) setSnapshot(blocked)
		return () => {
			listeners.delete(listener)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return snapshot
}
