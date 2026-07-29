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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Inline markers only, applied to text that is ALREADY html-escaped.
 * Both renderRich() and renderPost() go through here so there is exactly one
 * implementation of bold/italic/code/spoiler/links/mentions.
 */
function inlineRich(esc: string): string {
  const withCode = esc.replace(/`([^`]+)`/g, '<code class="rich-code">$1</code>')
  const withSpoiler = withCode.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" data-spoiler role="button" tabindex="0">$1</span>')
  const withBold = withSpoiler.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  const withItalic = withBold.replace(/(^|\s)\*([^*]+)\*/g, '$1<i>$2</i>')
  const withUnderline = withItalic.replace(/(^|\s)__([^_]+)__/g, '$1<u>$2</u>')
  const withStrike = withUnderline.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  const withLinks = withStrike.replace(/\b(https?:\/\/[^\s<]+)/g, (url) => {
    const invite = inviteCodeFromUrl(url)
    if (invite)
      return `<a href="${url}" data-invite="${invite}" class="rich-link invite-link">${url}</a>`
    return `<a href="${url}" target="_blank" rel="noreferrer noopener" class="rich-link">${url}</a>`
  })
  return withLinks.replace(/(^|\s)@([a-zA-Z0-9_]{2,32})/g, '$1<span class="mention">@$2</span>')
}

/** Tiny, safe inline formatter: **bold**, *italic*, `code`, ~~strike~~, ||spoiler||, @mention, links. */
export function renderRich(text: string): { __html: string } {
  return { __html: inlineRich(escapeHtml(text)).replace(/\n/g, '<br/>') }
}

/**
 * Channel-post renderer: everything renderRich() does, plus block-level layout
 * that is deliberately exclusive to channels — headings (#, ##, ###), dividers
 * (---), quotes (>) and bullet/numbered lists. Regular chats keep the plain
 * inline formatter so a stray "#" in conversation never turns into a headline.
 *
 * Note: the input is escaped first, so a quote line arrives here as "&gt;".
 */
export function renderPost(text: string): { __html: string } {
  const lines = escapeHtml(text).split('\n')
  const out: string[] = []
  let para: string[] = []
  let quote: string[] = []
  let list: string[] = []
  let listType: 'ul' | 'ol' = 'ul'

  const flushPara = () => {
    if (!para.length) return
    out.push(`<p class="my-1">${para.join('<br/>')}</p>`)
    para = []
  }
  const flushQuote = () => {
    if (!quote.length) return
    out.push(`<blockquote class="my-1.5 border-l-2 border-[var(--accent)] pl-2.5 opacity-90">${quote.join('<br/>')}</blockquote>`)
    quote = []
  }
  const flushList = () => {
    if (!list.length) return
    const cls = listType === 'ol' ? 'my-1.5 list-decimal space-y-0.5 pl-5' : 'my-1.5 list-disc space-y-0.5 pl-5'
    out.push(`<${listType} class="${cls}">${list.map((i) => `<li>${i}</li>`).join('')}</${listType}>`)
    list = []
  }
  const flushAll = () => {
    flushPara()
    flushQuote()
    flushList()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (!line.trim()) {
      flushAll()
      continue
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushAll()
      out.push('<hr class="my-2.5 h-px border-0 bg-current opacity-20"/>')
      continue
    }

    const heading = /^\s*(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      flushAll()
      const level = heading[1].length
      const cls =
        level === 1
          ? 'mb-1 mt-2 text-lg font-black leading-snug first:mt-0'
          : level === 2
          ? 'mb-1 mt-2 text-base font-bold leading-snug first:mt-0'
          : 'mb-0.5 mt-2 text-xs font-bold uppercase tracking-wide opacity-75 first:mt-0'
      out.push(`<div class="${cls}">${inlineRich(heading[2])}</div>`)
      continue
    }

    const quoted = /^\s*&gt;\s?(.*)$/.exec(line)
    if (quoted) {
      flushPara()
      flushList()
      quote.push(inlineRich(quoted[1]))
      continue
    }

    const ordered = /^\s*(\d{1,2})[.)]\s+(.+)$/.exec(line)
    if (ordered) {
      flushPara()
      flushQuote()
      if (listType !== 'ol') {
        flushList()
        listType = 'ol'
      }
      list.push(inlineRich(ordered[2]))
      continue
    }

    const bullet = /^\s*[-•]\s+(.+)$/.exec(line)
    if (bullet) {
      flushPara()
      flushQuote()
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      list.push(inlineRich(bullet[1]))
      continue
    }

    flushQuote()
    flushList()
    para.push(inlineRich(line))
  }

  flushAll()
  return { __html: out.join('') }
}

/**
 * Flatten a message for one-line previews (sidebar, pinned banner, replies).
 * Strips the inline formatting markers so `**bold**` never leaks as raw stars,
 * drops block markers (#, >, list bullets) used by channel posts, and collapses
 * newlines so a multi-line post cannot stretch a nowrap row.
 */
export function plainText(text: string): string {
  return text
    .replace(/^\s*#{1,3}\s+/gm, '')
    .replace(/^\s*&gt;\s?/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|\|([^|]+)\|\|/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)\*([^*]+)\*/g, '$1$2')
    .replace(/(^|\s)__([^_]+)__/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extracts the invite code from a FemboyChat invite link (#join=CODE), or null. */
export function inviteCodeFromUrl(url: string): string | null {
  const m = /#join=([A-Za-z0-9_-]+)/.exec(url)
  if (!m) return null
  try {
    const host = new URL(url).hostname
    const ours = host === location.hostname || host === 'femboychat.fun' || host === 'www.femboychat.fun'
    return ours ? m[1] : null
  } catch {
    return null
  }
}

/** First http(s) URL in a message text, for link previews. */
export function firstUrl(text: string): string | null {
  const m = /\bhttps?:\/\/[^\s<]+/.exec(text)
  return m ? m[0] : null
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
