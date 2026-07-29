import { useEffect, useState } from 'react'
import { stickerUrl } from '../../lib/stickers'

/**
 * Renders a sticker as a Twemoji image, falling back to the native emoji glyph.
 *
 * The fallback carries the `emoji` class so it is drawn with the colour emoji
 * font rather than whatever flat set the OS would pick.
 */
export function Sticker({ emoji, size = 112 }: { emoji: string; size?: number }) {
  const src = emoji ? stickerUrl(emoji) : ''
  const [failed, setFailed] = useState(false)

  // A new emoji deserves a fresh attempt: without this the component keeps the
  // failed state of a previous sticker when it is reused by React.
  useEffect(() => setFailed(false), [src])

  if (!src || failed) {
    return (
      <span className="emoji" style={{ fontSize: size * 0.8, lineHeight: 1 }}>
        {emoji}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={emoji}
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}
