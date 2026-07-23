// Stickers rendered from the open-source Twemoji set (CC-BY 4.0) via jsDelivr CDN.
// Everything degrades gracefully to the native emoji glyph if the image can't load,
// so stickers always look right even offline.

const U200D = String.fromCharCode(0x200d)
const UFE0F = /\uFE0F/g

function toCodePoint(text: string, sep = '-') {
  const r: string[] = []
  let c = 0
  let p = 0
  let i = 0
  while (i < text.length) {
    c = text.charCodeAt(i++)
    if (p) {
      r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16))
      p = 0
    } else if (0xd800 <= c && c <= 0xdbff) {
      p = c
    } else {
      r.push(c.toString(16))
    }
  }
  return r.join(sep)
}

export function emojiCode(emoji: string) {
  return toCodePoint(emoji.indexOf(U200D) < 0 ? emoji.replace(UFE0F, '') : emoji)
}

export function stickerUrl(emoji: string) {
  // Canonical Twemoji asset path (served via jsDelivr). Falls back to the
  // native emoji glyph in <Sticker/> if the image can't be fetched.
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${emojiCode(emoji)}.png`
}

export interface StickerPack {
  id: string
  label: string
  cover: string
  items: string[]
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: 'femboy',
    label: 'Femboy',
    cover: '🎀',
    items: ['🎀', '🧦', '🐈', '💅', '🌸', '💖', '🫶', '🦊', '🐾', '🍓', '✨', '🌈', '🧸', '💜', '🍭', '🥺', '😳', '💗'],
  },
  {
    id: 'faces',
    label: 'Мордочки',
    cover: '🥰',
    items: ['😊', '🥰', '😍', '😘', '😳', '🙈', '🥺', '😭', '😴', '😎', '🤗', '😂', '🤭', '🫠', '😌', '😏', '🤔', '😤'],
  },
  {
    id: 'hearts',
    label: 'Сердечки',
    cover: '💖',
    items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💗', '💓', '💞', '💕', '💘', '💝', '💟', '❣️'],
  },
  {
    id: 'hands',
    label: 'Ручки',
    cover: '🫶',
    items: ['👍', '👎', '👏', '🙌', '🫶', '🤝', '✌️', '🤟', '🫰', '👌', '🤌', '🙏', '💪', '🫂', '👐', '🤲', '👋', '🤙'],
  },
  {
    id: 'animals',
    label: 'Зверьки',
    cover: '🦊',
    items: ['🐱', '🐈', '🦊', '🐰', '🐻', '🐼', '🐨', '🐯', '🦁', '🐶', '🐺', '🐹', '🐭', '🐸', '🐧', '🦄', '🐣', '🐥'],
  },
]

/** Curated reaction set (Telegram-style quick reactions). */
export const REACTIONS = ['❤️', '🔥', '👍', '👎', '😂', '🥰', '😍', '🥺', '😳', '😭', '🎉', '🤨', '💯', '🤝', '🫶', '💅', '🎀', '✨']
