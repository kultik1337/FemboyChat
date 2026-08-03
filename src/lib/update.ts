/*
 * Проверка обновлений десктопного приложения.
 *
 * У приложения нет встроенного автообновления: для него нужен подписанный
 * ключом канал обновлений, а ключ живёт только у владельца репозитория. Пока
 * его нет, худшее, что можно сделать — молчать. Тогда человек годами сидит на
 * старой сборке и уверен, что у него всё свежее, потому что приложение ничего
 * не говорит.
 *
 * Поэтому здесь минимальная честная версия: приложение спрашивает у GitHub,
 * какой релиз сейчас последний, и если он новее установленного — показывает
 * это и даёт ссылку на установщик. Скачивание и установка остаются за
 * человеком.
 *
 * В браузере проверка не делается вообще: веб-версия обновляется сама при
 * перезагрузке страницы, и рассказывать ей про .exe бессмысленно.
 */

import { APP_RELEASE } from './version'
import { isDesktopApp } from './desktop'

const LATEST_RELEASE_API = 'https://api.github.com/repos/kultik1337/FemboyChat/releases/latest'
const RELEASES_PAGE = 'https://github.com/kultik1337/FemboyChat/releases/latest'

/** Раз в шесть часов более чем достаточно и не упирается в лимиты GitHub. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

const CHECKED_AT_KEY = 'fc:update:checkedAt'
const CACHE_KEY = 'fc:update:latest'
const SKIP_KEY = 'fc:update:skip'

export type UpdateInfo = {
  /** Версия без префикса v, например 1.0.3. */
  version: string
  /** Прямая ссылка на .exe, если он приложен к релизу, иначе страница релиза. */
  url: string
  /** Описание релиза, обрезанное до вменяемого размера. */
  notes: string
}

/**
 * Версия в виде списка чисел.
 *
 * Всё, что не число, становится нулём: сравнение версий не то место, где стоит
 * падать из-за неожиданного тега вроде v1.0.3-beta.
 */
function parts(raw: string): number[] {
  return raw
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((chunk) => {
      const n = Number.parseInt(chunk, 10)
      return Number.isFinite(n) ? n : 0
    })
}

/** Строго ли `candidate` новее, чем `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate)
  const b = parts(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

function readCache(): UpdateInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<UpdateInfo>
    if (typeof parsed?.version !== 'string' || typeof parsed?.url !== 'string') return null
    return { version: parsed.version, url: parsed.url, notes: typeof parsed.notes === 'string' ? parsed.notes : '' }
  } catch {
    return null
  }
}

type Release = {
  tag_name?: string
  name?: string
  body?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
  assets?: Array<{ name?: string; browser_download_url?: string }>
}

/**
 * Ссылка, по которой человек получит именно установщик.
 *
 * Если .exe к релизу не приложен (сборка ещё идёт или упала), ведём на страницу
 * релиза, а не в никуда: пустая кнопка «Скачать» хуже, чем кнопка, которая
 * честно показывает, что там пока нет файла.
 */
function downloadUrl(release: Release): string {
  const asset = (release.assets ?? []).find((item) => (item.name ?? '').toLowerCase().endsWith('.exe'))
  return asset?.browser_download_url ?? release.html_url ?? RELEASES_PAGE
}

async function fetchLatest(): Promise<UpdateInfo | null> {
  const res = await fetch(LATEST_RELEASE_API, { headers: { accept: 'application/vnd.github+json' } })
  // 404 — это нормальный ответ: релизов ещё нет ни одного.
  if (!res.ok) return null

  const release = (await res.json()) as Release
  if (release.draft || release.prerelease) return null

  const tag = release.tag_name ?? release.name ?? ''
  const version = tag.replace(/^v/i, '').trim()
  if (!version) return null

  const notes = (release.body ?? '').trim().slice(0, 600)
  return { version, url: downloadUrl(release), notes }
}

/**
 * Есть ли версия новее установленной.
 *
 * Возвращает null во всех случаях, когда обновления показывать не надо: в
 * браузере, при свежей проверке без результата, при отсутствии сети, при
 * пропущенной версии. Никогда не бросает — проверка обновлений не та задача,
 * ради которой стоит ронять интерфейс.
 */
export async function checkForUpdate(options: { force?: boolean } = {}): Promise<UpdateInfo | null> {
  if (!isDesktopApp()) return null

  try {
    const now = Date.now()
    const checkedAt = Number.parseInt(localStorage.getItem(CHECKED_AT_KEY) ?? '0', 10)
    const fresh = Number.isFinite(checkedAt) && now - checkedAt < CHECK_EVERY_MS

    // Пока результат свежий, сеть не трогаем и отвечаем из кеша: приложение
    // открывают десятки раз в день, релизы выходят куда реже.
    const info = !options.force && fresh ? readCache() : await fetchLatest()

    if (!options.force && !fresh) {
      localStorage.setItem(CHECKED_AT_KEY, String(now))
      if (info) localStorage.setItem(CACHE_KEY, JSON.stringify(info))
      else localStorage.removeItem(CACHE_KEY)
    }

    if (options.force && info) localStorage.setItem(CACHE_KEY, JSON.stringify(info))

    if (!info) return null
    if (!isNewer(info.version, APP_RELEASE)) return null
    if (!options.force && localStorage.getItem(SKIP_KEY) === info.version) return null
    return info
  } catch {
    return null
  }
}

/** Больше не напоминать про эту конкретную версию. */
export function skipVersion(version: string): void {
  try {
    localStorage.setItem(SKIP_KEY, version)
  } catch {
    /* приватный режим — переживём */
  }
}
