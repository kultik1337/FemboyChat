/**
 * Код-пароль на вход в приложение и двухфакторка (TOTP).
 *
 * Честно о том, что это такое: это замок на приложение на этом
 * устройстве, а не второй фактор на стороне сервера. Он закрывает переписку
 * от того, кто взял в руки разблокированный телефон или сел за чужой ноутбук,
 * и не защищает от того, кто украл пароль от аккаунта и зашёл со своего
 * компьютера. Поэтому настройки хранятся локально и про это прямо
 * написано в интерфейсе.
 *
 * PIN хранится не текстом, а как SHA-256 от «соль + PIN», прогнанный по кругу
 * несколько тысяч раз: четырёхзначный код перебирается мгновенно, если
 * проверка стоит один хеш.
 */

const KEY = 'fc:lock'
const SESSION_KEY = 'fc:lock:open'
const LAST_KEY = 'fc:lock:last'

/** Сколько раз прогоняем PIN через хеш. Заметно для перебора, незаметно для человека. */
const ROUNDS = 60_000

export type LockConfig = {
  salt: string
  hash: string
  /** base32-секрет для приложения-аутентификатора; пусто — 2FA выключена. */
  totp?: string
  /** Через сколько минут без приложения снова спросить код. 0 — сразу. */
  autoLockMin: number
}

export function getLock(): LockConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LockConfig
    if (!parsed?.salt || !parsed?.hash) return null
    return { autoLockMin: 0, ...parsed }
  } catch {
    return null
  }
}

export function lockEnabled(): boolean {
  return getLock() !== null
}

function save(cfg: LockConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function derive(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  let cur: ArrayBuffer = enc.encode(`${salt}:${pin}`).buffer as ArrayBuffer
  for (let i = 0; i < ROUNDS; i++) {
    cur = await crypto.subtle.digest('SHA-256', cur)
  }
  return hex(cur)
}

/** Установить или сменить код-пароль. Прежние настройки 2FA сохраняются. */
export async function setPin(pin: string): Promise<void> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const prev = getLock()
  save({ salt, hash: await derive(pin, salt), totp: prev?.totp, autoLockMin: prev?.autoLockMin ?? 0 })
  markUnlocked()
}

export async function verifyPin(pin: string): Promise<boolean> {
  const cfg = getLock()
  if (!cfg) return true
  return (await derive(pin, cfg.salt)) === cfg.hash
}

export function clearLock(): void {
  localStorage.removeItem(KEY)
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(LAST_KEY)
}

export function setAutoLock(minutes: number): void {
  const cfg = getLock()
  if (!cfg) return
  save({ ...cfg, autoLockMin: minutes })
}

export function setTotpSecret(secret: string | null): void {
  const cfg = getLock()
  if (!cfg) return
  save({ ...cfg, totp: secret ?? undefined })
}

/** Пометить текущую вкладку как разблокированную. */
export function markUnlocked(): void {
  sessionStorage.setItem(SESSION_KEY, '1')
  localStorage.setItem(LAST_KEY, String(Date.now()))
}

/** Отметить активность — от этого момента считается автоблокировка. */
export function touchLock(): void {
  if (lockEnabled()) localStorage.setItem(LAST_KEY, String(Date.now()))
}

/** Снова спросить код прямо сейчас. */
export function relock(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

/** Нужно ли показать экран блокировки прямо сейчас. */
export function shouldLock(): boolean {
  const cfg = getLock()
  if (!cfg) return false
  if (sessionStorage.getItem(SESSION_KEY) !== '1') return true
  if (cfg.autoLockMin > 0) {
    const last = Number(localStorage.getItem(LAST_KEY) || 0)
    if (last && Date.now() - last > cfg.autoLockMin * 60_000) return true
  }
  return false
}

// ── TOTP (RFC 6238, шесть цифр, шаг 30 секунд, SHA-1 — то, что ждёт любое
// приложение-аутентификатор) ──

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Свежий секрет на 160 бит в base32 — ровно то, что вбивают вручную. */
export function randomTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  let out = ''
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]
  return out
}

function base32Decode(secret: string): Uint8Array {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) continue
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  return bytes
}

async function totpAt(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff
    c = Math.floor(c / 256)
  }
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const offset = sig[sig.length - 1] & 0x0f
  const bin = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

/** Проверка с запасом в один шаг в обе стороны — часы на телефоне часто убегают. */
export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const wanted = code.replace(/\D/g, '')
  if (wanted.length !== 6) return false
  const step = Math.floor(Date.now() / 30_000)
  for (const c of [step - 1, step, step + 1]) {
    if ((await totpAt(secret, c)) === wanted) return true
  }
  return false
}

/** Ссылка для QR и для кнопки «открыть в аутентификаторе». */
export function otpauthUri(secret: string, account: string): string {
  const label = encodeURIComponent(`FemboyChat:${account}`)
  const issuer = encodeURIComponent('FemboyChat')
  return `otpauth:` + `//totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
}
