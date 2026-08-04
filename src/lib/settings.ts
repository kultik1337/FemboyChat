import { defaultSettings } from './defaults'
import type { Account, UserSettings } from '../types'

/**
 * Настройки аккаунта, дополненные до полного набора.
 *
 * В базе `profiles.settings` — jsonb с default '{}', и профиль новому
 * аккаунту создаёт триггер, который про наши дефолты ничего не знает. Плюс у
 * аккаунтов, заведённых до появления очередной настройки, нужного поля нет
 * просто по возрасту.
 *
 * Пустой объект — не null, поэтому проверки вида `settings ?? defaults()`
 * такой случай не ловят: объект есть, а полей в нём нет. Каждое обращение к
 * `settings.<что-нибудь>` при отрисовке — это шанс получить исключение, а
 * исключение в React снимает всё дерево и оставляет чёрный экран.
 */
export function normalizeSettings(raw: unknown): UserSettings {
  const patch = raw && typeof raw === 'object' ? (raw as Partial<UserSettings>) : {}
  return { ...defaultSettings(), ...patch }
}

/** Тот же аккаунт, но с гарантированно полными настройками. */
export function normalizeAccount(account: Account): Account {
  return { ...account, settings: normalizeSettings(account.settings) }
}
