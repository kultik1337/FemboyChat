// Anime-GIF picker powered by the free, keyless nekos.best API (CORS-enabled).
// https://docs.nekos.best — SFW anime reaction GIFs, perfect for the FemboyChat vibe.

export interface GifResult {
  url: string
  anime?: string
}

export const GIF_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: 'hug', label: 'Обнимашки', emoji: '🫂' },
  { id: 'pat', label: 'Погладить', emoji: '🐾' },
  { id: 'kiss', label: 'Поцелуй', emoji: '💋' },
  { id: 'cuddle', label: 'Прижаться', emoji: '🥰' },
  { id: 'blush', label: 'Смущение', emoji: '😳' },
  { id: 'happy', label: 'Радость', emoji: '😊' },
  { id: 'dance', label: 'Танец', emoji: '💃' },
  { id: 'laugh', label: 'Смех', emoji: '😂' },
  { id: 'wave', label: 'Привет', emoji: '👋' },
  { id: 'wink', label: 'Подмигнуть', emoji: '😉' },
  { id: 'pout', label: 'Дуться', emoji: '😤' },
  { id: 'cry', label: 'Плак', emoji: '😭' },
  { id: 'sleep', label: 'Спать', emoji: '😴' },
  { id: 'bite', label: 'Кусь', emoji: '😈' },
  { id: 'poke', label: 'Тык', emoji: '👉' },
  { id: 'highfive', label: 'Пять!', emoji: '🙏' },
  { id: 'nom', label: 'Ням', emoji: '🍰' },
  { id: 'thumbsup', label: 'Класс', emoji: '👍' },
]

const cache = new Map<string, GifResult[]>()

export async function fetchGifs(category: string, amount = 12): Promise<GifResult[]> {
  const key = `${category}:${amount}`
  const hit = cache.get(key)
  if (hit) return hit
  const res = await fetch(`https://nekos.best/api/v2/${encodeURIComponent(category)}?amount=${amount}`)
  if (!res.ok) throw new Error('GIF-сервис недоступен')
  const data = (await res.json()) as { results?: { url: string; anime_name?: string }[] }
  const out = (data.results ?? []).map((r) => ({ url: r.url, anime: r.anime_name }))
  cache.set(key, out)
  return out
}
