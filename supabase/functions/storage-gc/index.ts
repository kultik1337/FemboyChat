/*
 * Storage garbage collector for FemboyChat.
 *
 * Why this function exists at all: expiring messages are purged in the
 * database by a cron job, but their uploaded files live in Storage, and SQL
 * cannot delete them. `storage.protect_delete()` raises on any direct delete
 * from `storage.objects`, and rightly so. Objects must go through the Storage
 * API, which means an HTTP caller with the service key. That is this function.
 *
 * Two sources of work:
 *  1. the `fc_storage_gc` queue, filled by `fc_purge_expired_messages()` with
 *     the paths of files whose message just burned;
 *  2. `fc_storage_orphans()`, a safety net for files that lost their message
 *     some other way (a cascade-deleted comment, a wiped table, an upload that
 *     never got attached because the sender closed the tab).
 *
 * verify_jwt is false because the only caller is the database cron job, which
 * carries the shared secret. Every request without a valid secret is rejected
 * before any work happens: this endpoint deletes files, so it must never be
 * reachable by a browser.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const BUCKET = 'attachments'

// One tick must stay well inside the function time limit, so the work is
// capped. Whatever is left over is picked up by the next tick five minutes
// later; nothing is lost, the queue is durable.
const QUEUE_LIMIT = 200
const ORPHAN_LIMIT = 200

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-fc-secret',
	'access-control-allow-methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...CORS, 'content-type': 'application/json' },
	})
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
	const base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/'
	return await fetch(base + path, {
		...init,
		headers: {
			apikey: SERVICE_KEY,
			authorization: 'Bearer ' + SERVICE_KEY,
			'content-type': 'application/json',
			...(init.headers ?? {}),
		},
	})
}

async function restJson<T>(path: string, init: RequestInit = {}): Promise<T | null> {
	const res = await rest(path, init)
	if (!res.ok) return null
	const text = await res.text()
	if (!text) return null
	try {
		return JSON.parse(text) as T
	} catch (err) {
		return null
	}
}

async function sharedSecret(): Promise<string | null> {
	return await restJson<string>('rpc/get_fc_webhook_secret', { method: 'POST', body: '{}' })
}

/**
 * Deletes objects through the Storage API.
 *
 * Returns the paths the API confirmed as deleted. A path that is already gone
 * is simply absent from the answer, which is fine: the caller treats "gone"
 * and "deleted" the same way, both mean there is nothing left to clean up.
 */
async function removeObjects(paths: string[]): Promise<Set<string>> {
	const done = new Set<string>()
	if (paths.length === 0) return done

	const base = SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/' + BUCKET
	const res = await fetch(base, {
		method: 'DELETE',
		headers: {
			apikey: SERVICE_KEY,
			authorization: 'Bearer ' + SERVICE_KEY,
			'content-type': 'application/json',
		},
		body: JSON.stringify({ prefixes: paths }),
	})

	if (!res.ok) return done

	const removed = (await res.json().catch(() => null)) as Array<{ name?: string }> | null
	if (Array.isArray(removed)) for (const item of removed) if (item && typeof item.name === 'string') done.add(item.name)
	return done
}

/** Drains the queue filled by the message purge. */
async function drainQueue(): Promise<{ deleted: number; kept: number }> {
	const rows = await restJson<Array<{ path: string; tries: number }>>(
		'fc_storage_gc?bucket=eq.' + BUCKET + '&select=path,tries&order=queued_at.asc&limit=' + QUEUE_LIMIT,
	)
	if (!rows || rows.length === 0) return { deleted: 0, kept: 0 }

	const paths = rows.map((row) => row.path)
	const done = await removeObjects(paths)

	// A path the Storage API did not confirm stays in the queue, but with its
	// attempt counter bumped, so a permanently broken entry is visible in the
	// table instead of silently retrying until the end of time.
	const stuck = paths.filter((path) => !done.has(path))

	if (done.size > 0) {
		const list = '(' + [...done].map((path) => '"' + path.replace(/"/g, '\\"') + '"').join(',') + ')'
		await rest('fc_storage_gc?bucket=eq.' + BUCKET + '&path=in.' + encodeURIComponent(list), { method: 'DELETE' })
	}

	for (const path of stuck) {
		const row = rows.find((candidate) => candidate.path === path)
		await rest('fc_storage_gc?bucket=eq.' + BUCKET + '&path=eq.' + encodeURIComponent(path), {
			method: 'PATCH',
			body: JSON.stringify({ tries: (row?.tries ?? 0) + 1, last_error: 'storage api did not confirm the delete' }),
		})
	}

	return { deleted: done.size, kept: stuck.length }
}

/**
 * Deletes files that no message points at any more.
 *
 * The age guard lives in the SQL function, not here: a file is uploaded a
 * moment BEFORE the message row that references it exists, so a fresh orphan
 * is usually not an orphan at all, just an upload in flight.
 */
async function sweepOrphans(): Promise<number> {
	const rows = await restJson<Array<{ path: string }>>('rpc/fc_storage_orphans', {
		method: 'POST',
		body: JSON.stringify({ p_limit: ORPHAN_LIMIT }),
	})
	if (!rows || rows.length === 0) return 0

	const done = await removeObjects(rows.map((row) => row.path))
	return done.size
}

Deno.serve(async (req: Request) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

	const headerSecret = req.headers.get('x-fc-secret')
	if (!headerSecret) return json({ ok: false, reason: 'unauthorized' }, 401)

	const expected = await sharedSecret()
	if (!expected || headerSecret !== expected) return json({ ok: false, reason: 'bad-secret' }, 403)

	const body = (await req.json().catch(() => ({}))) as { action?: string; orphans?: boolean }
	if (body.action !== 'sweep') return json({ ok: false, reason: 'bad-request' }, 400)

	const queue = await drainQueue()
	// The orphan pass can be turned off per call, which is handy when someone
	// wants to drain only the queue while investigating.
	const orphans = body.orphans === false ? 0 : await sweepOrphans()

	return json({ ok: true, queueDeleted: queue.deleted, queueKept: queue.kept, orphansDeleted: orphans })
})
