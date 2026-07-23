import type { Backend } from './types'
import { LocalBackend } from './local'

let instance: Backend | null = null

// Production Supabase project for FemboyChat. The anon key is a publishable,
// browser-safe key (RLS guards the data), so it is fine to ship in the bundle.
// These are used only for production builds when no explicit VITE_ env vars are
// provided; in dev we keep the fully-featured in-browser LocalBackend unless
// you set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY yourself.
const FALLBACK_SUPABASE_URL = 'https://azriyxvofeceosuoptcm.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cml5eHZvZmVjZW9zdW9wdGNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MTk1MjUsImV4cCI6MjEwMDM5NTUyNX0.kcfKHXvkA6iL_nzE2_g_8nQNmUxJRvZmIe4wlik5oNQ'

/**
 * Choose a backend at runtime. If Supabase credentials are present (explicit env
 * vars, or the production fallback above) we use the production backend (real
 * emails + cross-device realtime + FemboyAI); otherwise we fall back to the
 * fully-featured in-browser LocalBackend so the app always works.
 */
export async function getBackend(): Promise<Backend> {
  if (instance) return instance
  const isProd = Boolean((import.meta as { env?: { PROD?: boolean } }).env?.PROD)
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    (isProd ? FALLBACK_SUPABASE_URL : undefined)
  const key =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (isProd ? FALLBACK_SUPABASE_ANON_KEY : undefined)
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
