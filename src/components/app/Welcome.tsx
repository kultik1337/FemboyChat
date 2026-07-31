import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { ACCENT_PRESETS, THEME_PRESETS, WALLPAPER_PRESETS } from '../../lib/defaults'
import { classNames } from '../../lib/util'
import { Logo } from '../ui/Logo'
import { Check, Sparkles } from '../ui/icons'
import { playSound } from '../../lib/sound'

/**
 * The first thing a new account sees.
 *
 * A messenger that ships nine themes hides all of them behind a settings screen
 * nobody opens, so every new account looks identical and the work is invisible.
 * Asking three questions right after registration costs fifteen seconds and
 * makes the app feel like it belongs to the person using it.
 *
 * Every choice applies **immediately** — the screen behind the card repaints as
 * you tap — because a preview swatch never really tells you how a theme feels.
 * There is no «save»: settings are already saved, the last step just closes.
 *
 * Shown once per account. The marker lives in localStorage rather than in the
 * profile, so it costs no migration and no extra column; the worst case is
 * seeing the greeting again on a brand-new device, which is harmless and,
 * frankly, quite nice.
 */

const SEEN_PREFIX = 'fc:welcomed:'

/** Has this account already been greeted on this device? */
export function welcomeSeen(uid: string): boolean {
  try {
    return localStorage.getItem(SEEN_PREFIX + uid) === '1'
  } catch {
    // No storage → never nag: pretend it has been seen.
    return true
  }
}

function markSeen(uid: string): void {
  try {
    localStorage.setItem(SEEN_PREFIX + uid, '1')
  } catch {
    // Private mode: the greeting simply comes back next time.
  }
}

type Step = 'hello' | 'theme' | 'accent' | 'wallpaper'

const ORDER: Step[] = ['hello', 'theme', 'accent', 'wallpaper']

export function Welcome({ onDone }: { onDone: () => void }) {
  const account = useStore((s) => s.account)
  const patchSettings = useStore((s) => s.patchSettings)
  const [step, setStep] = useState<Step>('hello')

  if (!account) return null
  const settings = account.settings
  const index = ORDER.indexOf(step)
  const last = index === ORDER.length - 1

  function next() {
    playSound('tap')
    if (last) {
      markSeen(account!.uid)
      playSound('success')
      onDone()
      return
    }
    setStep(ORDER[index + 1])
  }

  function skip() {
    markSeen(account!.uid)
    onDone()
  }

  /** Applying on tap is the whole point: the background changes under the card. */
  function choose(patch: Parameters<typeof patchSettings>[0]) {
    playSound('tap')
    void patchSettings(patch)
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center p-4"
      style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}
    >
      <div className="animate-pop-in flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <Logo size={34} className="!rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">Настройка внешнего вида</div>
            <div className="text-xs text-[var(--muted)]">Шаг {index + 1} из {ORDER.length} · можно поменять в любой момент</div>
          </div>
          <button onClick={skip} className="btn-ghost shrink-0 text-xs">Пропустить</button>
        </div>

        {/* Progress: four hairlines, filled as you go. */}
        <div className="flex gap-1 px-5 pt-3">
          {ORDER.map((s, i) => (
            <div
              key={s}
              className={classNames(
                'h-1 flex-1 rounded-full transition-colors',
                i <= index ? 'accent-gradient' : 'bg-[var(--panel-2)]',
              )}
            />
          ))}
        </div>

        <div className="fancy-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 'hello' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Logo size={72} className="animate-float !rounded-2xl" />
              <div className="text-lg font-extrabold">
                Привет, {account.name || account.username}! <Sparkles size={18} className="accent-text inline align-[-3px]" />
              </div>
              <p className="max-w-sm text-sm text-[var(--muted)]">
                Давай за полминуты сделаем FemboyChat твоим: выберем тему, цвет и фон чата.
                Всё меняется сразу — просто тыкай и смотри.
              </p>
            </div>
          )}

          {step === 'theme' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEME_PRESETS.map((t) => {
                const active = settings.theme === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => choose({ theme: t.id })}
                    className={classNames(
                      'flex flex-col gap-2 rounded-2xl border p-2 text-left transition',
                      active ? 'border-[var(--accent)] ring-2 ring-[var(--ring)]' : 'border-[var(--border)] hover:bg-[var(--panel-hover)]',
                    )}
                  >
                    <div
                      className="relative h-12 w-full rounded-xl border border-[var(--border)]"
                      style={{ background: `linear-gradient(140deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
                    >
                      {active && (
                        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
                          <Check size={12} strokeWidth={2.4} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{t.name}</div>
                      <div className="truncate text-[10px] text-[var(--muted)]">{t.hint}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'accent' && (
            <div className="grid grid-cols-3 gap-2">
              {ACCENT_PRESETS.map((a) => {
                const active = settings.accent.toLowerCase() === a.accent.toLowerCase()
                return (
                  <button
                    key={a.accent}
                    onClick={() => choose({ accent: a.accent })}
                    className={classNames(
                      'flex items-center gap-2 rounded-2xl border px-2.5 py-2 transition',
                      active ? 'border-[var(--accent)] ring-2 ring-[var(--ring)]' : 'border-[var(--border)] hover:bg-[var(--panel-hover)]',
                    )}
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white"
                      style={{ background: `linear-gradient(140deg, ${a.accent}, ${a.accent2})` }}
                    >
                      {active && <Check size={13} strokeWidth={2.4} />}
                    </span>
                    <span className="min-w-0 truncate text-xs font-semibold">{a.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'wallpaper' && (
            <div className="grid grid-cols-3 gap-2">
              {WALLPAPER_PRESETS.map((w) => {
                const active = settings.wallpaper === w.id
                return (
                  <button
                    key={w.id}
                    onClick={() => choose({ wallpaper: w.id })}
                    className={classNames(
                      'overflow-hidden rounded-2xl border transition',
                      active ? 'border-[var(--accent)] ring-2 ring-[var(--ring)]' : 'border-[var(--border)] hover:bg-[var(--panel-hover)]',
                    )}
                  >
                    {/* The real wallpaper class, so this is a true preview. */}
                    <div className={classNames('relative h-14 w-full', `wallpaper-${w.id}`)}>
                      {active && (
                        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
                          <Check size={12} strokeWidth={2.4} />
                        </span>
                      )}
                    </div>
                    <div className="truncate px-2 py-1.5 text-[11px] font-semibold">{w.name}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
          {index > 0 && (
            <button onClick={() => { playSound('tap'); setStep(ORDER[index - 1]) }} className="btn-ghost text-sm">
              Назад
            </button>
          )}
          <button onClick={next} className="btn-primary ml-auto text-sm">
            {step === 'hello' ? 'Поехали' : last ? 'Готово' : 'Дальше'}
          </button>
        </div>
      </div>
    </div>
  )
}
