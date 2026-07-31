/**
 * Perks: what this account is allowed to do beyond the basics.
 *
 * The server is the only authority here — every perk is re-checked inside the
 * RPC that uses it, so this module is purely about *showing* the right things.
 * Nothing here can grant anything; the worst a tampered client can do is draw a
 * button that then fails on the server.
 *
 * The value is cached per account for the lifetime of the tab: perks change
 * rarely (an admin grants something once), and re-asking on every render would
 * mean a round trip per component.
 */

import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

export interface Perks {
  uid: string
  is_admin: boolean
  can_create_bots: boolean
  premium: boolean
  verified: boolean
  max_bots: number
}

/** What an account with no row (or no server) gets. */
export const NO_PERKS: Perks = {
  uid: '',
  is_admin: false,
  can_create_bots: false,
  premium: false,
  verified: false,
  max_bots: 0,
}

let cache: { uid: string; perks: Perks } | null = null
let inflight: Promise<Perks> | null = null
/** Components mounted right now, so a refresh reaches all of them. */
const listeners = new Set<(p: Perks) => void>()

function normalise(raw: unknown, uid: string): Perks {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    uid,
    is_admin: r.is_admin === true,
    can_create_bots: r.can_create_bots === true,
    premium: r.premium === true,
    verified: r.verified === true,
    max_bots: typeof r.max_bots === 'number' ? r.max_bots : 0,
  }
}

/** Ask the server once per account, then serve everyone from memory. */
export async function loadPerks(force = false): Promise<Perks> {
  const state = useStore.getState()
  const uid = state.account?.uid
  if (!uid) return NO_PERKS
  if (!force && cache?.uid === uid) return cache.perks
  if (inflight) return inflight

  inflight = (async () => {
    // Demo mode has no server: nobody is an admin there, and that is correct.
    const raw = await state.backend?.rpc?.('my_perks')
    const perks = normalise(raw, uid)
    cache = { uid, perks }
    inflight = null
    for (const fn of listeners) fn(perks)
    return perks
  })()

  return inflight
}

/** Called after an admin changes something about themselves. */
export function invalidatePerks(): void {
  cache = null
  void loadPerks(true)
}

/**
 * Perks for the signed-in account. Starts as «nothing», which means a button
 * that needs a perk never flashes into view before the answer arrives.
 */
export function usePerks(): Perks {
  const uid = useStore((s) => s.account?.uid)
  const [perks, setPerks] = useState<Perks>(() => (cache?.uid === uid ? cache.perks : NO_PERKS))

  useEffect(() => {
    if (!uid) {
      setPerks(NO_PERKS)
      return
    }
    listeners.add(setPerks)
    void loadPerks().then(setPerks)
    return () => {
      listeners.delete(setPerks)
    }
  }, [uid])

  return perks
}
