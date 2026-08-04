import { useStore } from '../store/useStore'
import { defaultSettings } from './defaults'
import { normalizeAccount } from './settings'
import type { Account } from '../types'

/**
 * Последняя линия обороны для настроек аккаунта.
 *
 * Достраивать настройки на выходе из бэкенда (см. `backend/index.ts`) —
 * правильное место, но единственное: любой новый путь, по которому аккаунт
 * попадёт в стор, снова принесёт с собой `profiles.settings = {}` из базы. А
 * цена ошибки несоразмерна причине: экран «Оформление» сравнивает выбранный
 * цвет через `accent.toLowerCase()`, и на отсутствующем поле это исключение во
 * время отрисовки. Исключение в render снимает всё дерево React — пользователь
 * видит чёрный экран вместо интерфейса.
 *
 * Поэтому за настройками следим там, откуда их читает интерфейс, — в сторе.
 * Аккаунт с неполными настройками заменяется на достроенный сразу же, как
 * попал в состояние, ещё до того, как на него успеет отрисоваться экран.
 */

/** Есть ли в объекте все поля, которые интерфейс считает обязательными. */
function isComplete(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false
  const row = settings as Record<string, unknown>
  return Object.keys(defaultSettings()).every((key) => row[key] !== undefined)
}

export function installSettingsGuard() {
  const repair = (account: Account | null) => {
    if (!account || isComplete(account.settings)) return
    useStore.setState({ account: normalizeAccount(account) })
  }

  // Стор может быть уже наполнен к моменту установки — проверяем и текущее
  // состояние, а не только будущие изменения.
  repair(useStore.getState().account)

  useStore.subscribe((state, prev) => {
    if (state.account !== prev.account) repair(state.account)
  })
}
