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
    case 'circle': return '⭕ Видеосообщение'
    case 'voice': return '🎤 Голосовое сообщение'
    case 'audio': return '🎵 Аудио'
    default: return `📎 ${a.name ?? 'Файл'}`
  }
}

/** Виды, которые рисуются картинкой, а не строкой с иконкой файла. */
export function isVisualKind(kind: AttachmentKind): boolean {
  return kind === 'image' || kind === 'gif' || kind === 'video' || kind === 'circle'
}

/** Сколько медиа влезает в один альбом. Как в Телеграме. */
export const MAX_ALBUM = 10

/** Предел длины кружка. Дальше это уже не «сообщение», а видео файлом. */
export const MAX_CIRCLE_SEC = 60

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

/**
 * Размеры, длительность и первый кадр видео — одним проходом.
 *
 * Всё держится на скрытом <video>: другого способа узнать длительность блоба в
 * браузере нет. Кадр снимается на `seeked`, а не на `loadeddata`: у части
 * кодеков первый декодированный кадр ещё чёрный, и постер получался пустым.
 *
 * Ошибки не пробрасываются: превью — украшение, из-за него не должна падать
 * отправка. Не вышло — вернём то, что успели узнать.
 */
export function videoMeta(
  blob: Blob,
  posterMax = 320,
): Promise<{ w?: number; h?: number; durationSec?: number; poster?: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    let settled = false
    const done = (out: { w?: number; h?: number; durationSec?: number; poster?: string }) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(out)
    }

    // Кодек может не отдать ни metadata, ни ошибку — тогда отправка повисла бы
    // на этом промисе навсегда.
    const timer = setTimeout(() => done({}), 4000)

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url

    video.onerror = () => { clearTimeout(timer); done({}) }

    video.onloadedmetadata = () => {
      const w = video.videoWidth || undefined
      const h = video.videoHeight || undefined
      const raw = video.duration
      const durationSec = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined
      const base = { w, h, durationSec }

      const grab = () => {
        clearTimeout(timer)
        try {
          const scale = Math.min(1, posterMax / Math.max(video.videoWidth, video.videoHeight))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) return done(base)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          done({ ...base, poster: canvas.toDataURL('image/jpeg', 0.7) })
        } catch {
          done(base)
        }
      }

      video.onseeked = grab
      // 0 иногда попадает в чёрный кадр перед первым ключевым.
      try {
        video.currentTime = Math.min(0.1, (durationSec ?? 1) / 2)
      } catch {
        grab()
      }
    }
  })
}

/**
 * Обрезать видео до квадрата и уменьшить — так кружок весит столько же,
 * сколько голосовое, а не как полноценный ролик.
 *
 * Делается прямо в MediaRecorder на стороне записи (см. CircleRecorder), здесь
 * же остаётся только вычисление квадратной области кадра, чтобы одна и та же
 * арифметика не разъехалась между записью и превью.
 */
export function squareCrop(w: number, h: number): { x: number; y: number; side: number } {
  const side = Math.min(w, h)
  return { x: Math.round((w - side) / 2), y: Math.round((h - side) / 2), side }
}
