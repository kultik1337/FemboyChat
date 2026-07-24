import type { Attachment, AttachmentKind } from '../types'

/** Classify a file into an attachment kind by its MIME type. */
export function attachmentKindFor(file: { type?: string }): AttachmentKind {
  const mime = file.type ?? ''
  if (mime === 'image/gif') return 'gif'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

export function prettySize(bytes?: number) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`
}

/** Human label for attachment previews (sidebar, replies, pinned banner). */
export function attachmentLabel(a?: Attachment) {
  if (!a) return ''
  switch (a.kind) {
    case 'image': return '📷 Фото'
    case 'gif': return '🖼 GIF'
    case 'video': return '🎬 Видео'
    case 'voice': return '🎤 Голосовое сообщение'
    case 'audio': return '🎵 Аудио'
    default: return `📎 ${a.name ?? 'Файл'}`
  }
}

/** Measure intrinsic dimensions of an image blob (best effort). */
export function imageSize(blob: Blob): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    img.src = url
  })
}

/**
 * Downscale an image to fit into `max` px (longest side) and re-encode it.
 * Keeps GIFs untouched (canvas would lose the animation). Falls back to the
 * original file when decoding fails (e.g. exotic formats).
 */
export async function downscaleImage(file: File, max = 1600, quality = 0.86): Promise<Blob> {
  if (file.type === 'image/gif' || !file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 900_000) return file
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

export function extensionFor(mime: string, fallbackName?: string) {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/pdf': 'pdf',
  }
  if (map[mime]) return map[mime]
  const dot = (fallbackName ?? '').lastIndexOf('.')
  if (dot > -1) return (fallbackName ?? '').slice(dot + 1).toLowerCase().slice(0, 8)
  return 'bin'
}
