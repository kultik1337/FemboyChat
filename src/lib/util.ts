export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36))

export function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}

const AVATAR_COLORS = [
  '#ff7ab8', '#7cc4ff', '#b388ff', '#5ad1c4', '#ffb26b',
  '#ff8f8f', '#8ee6a0', '#f2a2e8', '#6ad3ff', '#ffd36b',
]
export function colorFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => [...p][0]?.toUpperCase() ?? '').join('')
}

export function timeShort(ts: number, lang: 'ru' | 'en' = 'ru') {
  return new Date(ts).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function dayLabel(ts: number, lang: 'ru' | 'en' = 'ru') {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay) return lang === 'ru' ? 'Сегодня' : 'Today'
  if (d.toDateString() === yesterday.toDateString()) return lang === 'ru' ? 'Вчера' : 'Yesterday'
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
  })
}

export function lastSeenLabel(ts: number, online: boolean, lang: 'ru' | 'en' = 'ru') {
  if (online) return lang === 'ru' ? 'в сети' : 'online'
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return lang === 'ru' ? 'был(а) только что' : 'last seen just now'
  if (m < 60) return lang === 'ru' ? `был(а) ${m} мин назад` : `last seen ${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return lang === 'ru' ? `был(а) ${h} ч назад` : `last seen ${h}h ago`
  const d = Math.floor(h / 24)
  return lang === 'ru' ? `был(а) ${d} дн назад` : `last seen ${d}d ago`
}

/** Tiny, safe inline formatter: **bold**, *italic*, `code`, ~~strike~~, links. */
export function renderRich(text: string): { __html: string } {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const withCode = esc.replace(/`([^`]+)`/g, '<code class="rich-code">$1</code>')
  const withBold = withCode.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  const withItalic = withBold.replace(/(^|\s)\*([^*]+)\*/g, '$1<i>$2</i>')
  const withStrike = withItalic.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  const withLinks = withStrike.replace(
    /\b(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer noopener" class="rich-link">$1</a>',
  )
  return { __html: withLinks.replace(/\n/g, '<br/>') }
}

export function normalizeUsername(u: string) {
  return u.replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
}

export function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
