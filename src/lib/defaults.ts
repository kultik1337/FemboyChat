import type { ThemeName, UserSettings, WallpaperName } from '../types'

export function defaultSettings(): UserSettings {
  return {
    theme: 'dark',
    accent: '#7c9cff',
    wallpaper: 'mesh',
    fontScale: 1,
    bubbleRadius: 18,
    enterToSend: true,
    animations: true,
    bigEmoji: true,
    language: 'ru',
    showLastSeen: true,
    showReadReceipts: true,
    ghostMode: false,
    whoCanMessage: 'everyone',
    notifySound: true,
    notifyPreview: true,
    premium: false,
    nameGradient: false,
    emoticons: true,
    sendSound: false,
  }
}

/**
 * Accent colours, calm ones first. The old pink is still here — taste changes,
 * and someone who picked it should not have it taken away — but it is no longer
 * what a new account starts with.
 */
export const ACCENT_PRESETS = [
  { name: 'Индиго', accent: '#7c9cff', accent2: '#9d8bff' },
  { name: 'Океан', accent: '#3fb9d4', accent2: '#5ad1c4' },
  { name: 'Изумруд', accent: '#3fc98a', accent2: '#8ee6a0' },
  { name: 'Янтарь', accent: '#ffa94d', accent2: '#ff8f6b' },
  { name: 'Закат', accent: '#ff7a59', accent2: '#ffb26b' },
  { name: 'Слива', accent: '#a78bfa', accent2: '#7cc4ff' },
  { name: 'Графит', accent: '#8b95a7', accent2: '#aab4c4' },
  { name: 'Вишня', accent: '#f2555a', accent2: '#ff8f8f' },
  { name: 'Розовый', accent: '#ff7ab8', accent2: '#7cc4ff' },
]

/**
 * Everything the appearance screen needs to draw a theme card. `swatch` is the
 * pair of colours shown in the preview, so a theme can be recognised without
 * applying it first.
 */
export const THEME_PRESETS: Array<{
  id: ThemeName
  name: string
  hint: string
  swatch: [string, string]
  dark: boolean
}> = [
  { id: 'auto', name: 'Как в системе', hint: 'Следует настройкам устройства', swatch: ['#f4f6fb', '#171a21'], dark: false },
  { id: 'light', name: 'Светлая', hint: 'Чистая и нейтральная', swatch: ['#f7f8fc', '#ffffff'], dark: false },
  { id: 'dark', name: 'Тёмная', hint: 'Мягкий угольный серый', swatch: ['#171a21', '#20242e'], dark: true },
  { id: 'graphite', name: 'Графит', hint: 'Почти чёрная, без оттенков', swatch: ['#0e0f12', '#191b1f'], dark: true },
  { id: 'midnight', name: 'Полночь', hint: 'Глубокий синий', swatch: ['#0b1020', '#16203c'], dark: true },
  { id: 'ocean', name: 'Океан', hint: 'Сине-бирюзовая глубина', swatch: ['#071a22', '#0e2b36'], dark: true },
  { id: 'forest', name: 'Лес', hint: 'Тёмная зелень', swatch: ['#0c1712', '#14261d'], dark: true },
  { id: 'sunset', name: 'Закат', hint: 'Тёплый полумрак', swatch: ['#1a1113', '#291a1c'], dark: true },
  { id: 'lavender', name: 'Лаванда', hint: 'Светлая сиреневая', swatch: ['#f6f4ff', '#ffffff'], dark: false },
]

/** Chat backgrounds offered in the appearance screen. */
export const WALLPAPER_PRESETS: Array<{ id: WallpaperName; name: string }> = [
  { id: 'mesh', name: 'Градиент' },
  { id: 'aurora', name: 'Сияние' },
  { id: 'waves', name: 'Волны' },
  { id: 'grid', name: 'Сетка' },
  { id: 'dots', name: 'Точки' },
  { id: 'stars', name: 'Звёзды' },
  { id: 'glow', name: 'Свечение' },
  { id: 'hearts', name: 'Сердечки' },
  { id: 'plain', name: 'Без фона' },
]

export const STICKERS = ['🎀', '🌸', '💖', '✨', '🐾', '🧸', '🍓', '🫶', '😳', '🥺', '💅', '🌈', '🦄', '🧦', '💜', '🐈']

export const QUICK_EMOJI = ['❤️', '🔥', '😂', '🥺', '👍', '🎀', '✨', '😳', '🫶', '💅', '🌸', '💜']
