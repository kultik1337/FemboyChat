import type { UserSettings } from '../types'

export function defaultSettings(): UserSettings {
  return {
    theme: 'light',
    accent: '#ff7ab8',
    wallpaper: 'aurora',
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
  }
}

export const ACCENT_PRESETS = [
  { name: 'Розовый', accent: '#ff7ab8', accent2: '#7cc4ff' },
  { name: 'Лаванда', accent: '#b388ff', accent2: '#7cc4ff' },
  { name: 'Мятный', accent: '#5ad1c4', accent2: '#8ee6a0' },
  { name: 'Персик', accent: '#ffb26b', accent2: '#ff8f8f' },
  { name: 'Небо', accent: '#6ad3ff', accent2: '#b388ff' },
  { name: 'Фуксия', accent: '#ff5fa2', accent2: '#ff9ecd' },
]

export const STICKERS = ['🎀', '🌸', '💖', '✨', '🐾', '🧸', '🍓', '🫶', '😳', '🥺', '💅', '🌈', '🦄', '🧦', '💜', '🐈']

export const QUICK_EMOJI = ['❤️', '🔥', '😂', '🥺', '👍', '🎀', '✨', '😳', '🫶', '💅', '🌸', '💜']
