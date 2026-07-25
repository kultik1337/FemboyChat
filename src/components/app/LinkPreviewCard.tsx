import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { classNames, firstUrl, inviteCodeFromUrl } from '../../lib/util'
import type { LinkPreview } from '../../types'

// Module-level cache so a URL is only fetched once per session (across bubbles).
const previewCache = new Map<string, LinkPreview | null>()

/**
 * Renders under a message's text: either a "join this chat" invite card for
 * FemboyChat invite links, or an OG-preview card (fetched via the link-preview
 * edge function; LocalBackend returns null so nothing shows in demo mode).
 */
export function LinkPreviewCard({ text, isMine }: { text: string; isMine: boolean }) {
  const url = firstUrl(text)
  if (!url) return null
  const invite = inviteCodeFromUrl(url)
  if (invite) return <InviteCard code={invite} isMine={isMine} />
  return <UrlPreview url={url} isMine={isMine} />
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
