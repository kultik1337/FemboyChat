import type { Backend } from './types'
import { LocalBackend } from './local'

let instance: Backend | null = null

/**
 * Choose a backend at runtime. If Supabase credentials are present we use the
 * production backend (real emails + cross-device realtime); otherwise we fall
 * back to the fully-featured in-browser LocalBackend so the app always works.
 */
export async function getBackend(): Promise<Backend> {
  if (instance) return instance
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && key) {
    const { SupabaseBackend } = await import('./supabase')
    instance = new SupabaseBackend(url, key)
  } else {
    instance = new LocalBackend()
  }
  await instance.init()
  return instance
}

export type { Backend } from './types'
