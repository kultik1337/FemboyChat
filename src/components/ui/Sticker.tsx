import { useState } from 'react'
import { stickerUrl } from '../../lib/stickers'

/** Renders a sticker as a Twemoji image, falling back to the native emoji glyph. */
export function Sticker({ emoji, size = 112 }: { emoji: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed || !emoji) {
    return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{emoji}</span>
  }
  return (
    <img
      src={stickerUrl(emoji)}
      alt={emoji}
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}
