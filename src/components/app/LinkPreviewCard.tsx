import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { classNames, firstUrl, inviteCodeFromUrl } from '../../lib/util'
import type { LinkPreview } from '../../types'

// Module-level cache so a URL is only fetched once per session (across bubbles).
const previewCache = new Map<string, LinkPreview | null>()

/**
 * Renders under a message's text. In priority order:
 *   1. FemboyChat invite link  -> "join this chat" card
 *   2. YouTube link            -> thumbnail facade that becomes a player on click
 *   3. Direct image link       -> the image itself
 *   4. Anything else           -> OG-preview card (via the link-preview edge
 *      function; LocalBackend returns null so nothing shows in demo mode)
 */
export function LinkPreviewCard({ text, isMine }: { text: string; isMine: boolean }) {
  const url = firstUrl(text)
  if (!url) return null

  const invite = inviteCodeFromUrl(url)
  if (invite) return <InviteCard code={invite} isMine={isMine} />

  const yt = youtubeId(url)
  if (yt) return <YouTubeCard id={yt} url={url} start={youtubeStart(url)} />

  if (isImageUrl(url)) return <ImageCard url={url} isMine={isMine} />

  return <UrlPreview url={url} isMine={isMine} />
}

/**
 * Extracts a video id from every YouTube URL shape we care about:
 * youtube.com/watch?v=ID, youtu.be/ID, /shorts/ID, /embed/ID, /live/ID.
 * Returns null for anything else (including youtube.com/@channel pages,
 * which should fall through to the normal OG card).
 */
export function youtubeId(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '')
  const ok = /^[\w-]{11}$/

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    return ok.test(id) ? id : null
  }
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return null

  const v = u.searchParams.get('v')
  if (v && ok.test(v)) return v

  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)
  return m ? m[1] : null
}

/** Reads ?t=90 / ?t=1m30s / ?start=90 so "start at" links keep their timestamp. */
function youtubeStart(raw: string): number {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return 0
  }
  const t = u.searchParams.get('t') ?? u.searchParams.get('start')
  if (!t) return 0
  if (/^\d+$/.test(t)) return Number(t)
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

function isImageUrl(raw: string): boolean {
  try {
    return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(new URL(raw).pathname)
  } catch {
    return false
  }
}

function cardStyle(isMine: boolean): React.CSSProperties {
  return {
    background: isMine ? 'rgba(255,255,255,.14)' : 'rgba(127,127,127,.1)',
    borderLeft: `3px solid ${isMine ? 'rgba(255,255,255,.75)' : 'var(--accent)'}`,
  }
}

function InviteCard({ code, isMine }: { code: string; isMine: boolean }) {
  const joinInvite = useStore((s) => s.joinInvite)
  return (
    <div className="mt-1.5 overflow-hidden rounded-lg px-2.5 py-2" style={cardStyle(isMine)}>
      <div className="text-[13px] font-semibold">💌 Приглашение в чат</div>
      <div className="mt-0.5 text-xs opacity-75">Ссылка-приглашение в приватный чат FemboyChat</div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          void joinInvite(code)
        }}
        className={classNames(
          'mt-1.5 rounded-lg px-3 py-1 text-xs font-bold transition active:scale-95',
          isMine ? 'bg-white/90 text-[var(--accent)]' : 'bg-[var(--accent)] text-white',
        )}
      >
        Присоединиться
      </button>
    </div>
  )
}

/**
 * A "facade" player: we show YouTube's own thumbnail and only mount the iframe
 * once the user actually presses play. Mounting iframes eagerly would load a
 * few hundred KB of third-party JS per link and visibly stutter a chat that has
 * several videos in its history.
 */
function YouTubeCard({ id, url, start }: { id: string; url: string; start: number }) {
  const [playing, setPlaying] = useState(false)

  // hqdefault exists for every video; maxresdefault does not, so do not use it.
  const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  const src =
    `https://www.youtube-nocookie.com/embed/${id}` +
    `?autoplay=1&rel=0&modestbranding=1${start ? `&start=${start}` : ''}`

  return (
    <div
      className="mt-1.5 overflow-hidden rounded-xl bg-black/60"
      style={{ aspectRatio: '16 / 9' }}
      onClick={(e) => e.stopPropagation()}
    >
      {playing ? (
        <iframe
          src={src}
          title="YouTube"
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Смотреть на YouTube"
          className="group relative block h-full w-full"
        >
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-[68px] place-items-center rounded-xl bg-black/65 transition group-hover:bg-[#f00]">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
          <span className="absolute bottom-1.5 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">
            YouTube
          </span>
        </button>
      )}
      <a href={url} target="_blank" rel="noreferrer noopener" className="sr-only">
        Открыть на YouTube
      </a>
    </div>
  )
}

/** Direct image link: show the picture instead of a mostly-empty OG card. */
function ImageCard({ url, isMine }: { url: string; isMine: boolean }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <UrlPreview url={url} isMine={isMine} />

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-1.5 block overflow-hidden rounded-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="max-h-72 w-full bg-black/10 object-cover"
      />
    </a>
  )
}

function UrlPreview({ url, isMine }: { url: string; isMine: boolean }) {
  const backend = useStore((s) => s.backend)
  const [preview, setPreview] = useState<LinkPreview | null>(() => previewCache.get(url) ?? null)

  useEffect(() => {
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) ?? null)
      return
    }
    let alive = true
    backend
      ?.fetchLinkPreview(url)
      .then((p) => {
        previewCache.set(url, p)
        if (alive) setPreview(p)
      })
      .catch(() => previewCache.set(url, null))
    return () => {
      alive = false
    }
  }, [url, backend])

  if (!preview || (!preview.title && !preview.description)) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-1.5 flex items-stretch gap-0 overflow-hidden rounded-lg no-underline"
      style={{ ...cardStyle(isMine), color: 'inherit' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="min-w-0 flex-1 px-2.5 py-1.5">
        {preview.siteName && (
          <div className={classNames('text-[11px] font-bold', isMine ? 'opacity-90' : 'text-[var(--accent)]')}>
            {preview.siteName}
          </div>
        )}
        {preview.title && <div className="line-clamp-2 text-[13px] font-semibold leading-snug">{preview.title}</div>}
        {preview.description && <div className="line-clamp-2 text-xs leading-snug opacity-75">{preview.description}</div>}
      </div>
      {preview.image && (
        <img src={preview.image} alt="" loading="lazy" className="m-1.5 h-16 w-16 shrink-0 rounded-md object-cover" />
      )}
    </a>
  )
}
