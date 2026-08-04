import type { Account } from '../../types'
import type { AuthResult, Backend } from './types'
import { LocalBackend } from './local'
import { normalizeAccount } from '../settings'

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
 * Достроить настройки у каждого аккаунта, который выдаёт бэкенд.
 *
 * Это единственное место, через которое аккаунт попадает в приложение, поэтому
 * одна заплатка здесь закрывает и вход, и регистрацию, и восстановление
 * сессии, и сохранение профиля — для любого бэкенда, не только для Supabase.
 *
 * Методы подменяются на самом объекте, а оригиналы берутся с привязанным
 * `this`: иначе класс потеряет доступ к своим полям.
 */
function hardenAccountSettings(backend: Backend): Backend {
  const register = backend.register.bind(backend)
  const login = backend.login.bind(backend)
  const restore = backend.restore.bind(backend)
  const updateAccount = backend.updateAccount.bind(backend)

  const fixAuth = (result: AuthResult): AuthResult =>
    result.account ? { ...result, account: normalizeAccount(result.account) } : result

  backend.register = async (email: string, username: string, name: string, password: string) =>
    fixAuth(await register(email, username, name, password))

  backend.login = async (email: string, password: string) => fixAuth(await login(email, password))

  backend.restore = async (): Promise<Account | null> => {
    const account = await restore()
    return account ? normalizeAccount(account) : null
  }

  backend.updateAccount = async (patch: Partial<Account>): Promise<Account> =>
    normalizeAccount(await updateAccount(patch))

  return backend
}

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
    instance = hardenAccountSettings(new SupabaseBackend(url, key))
  } else {
    instance = hardenAccountSettings(new LocalBackend())
  }
  await instance.init()
  return instance
}

export type { Backend } from './types'
