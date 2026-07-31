import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { getLock, markUnlocked, verifyPin, verifyTotp } from '../../lib/lock'
import { classNames } from '../../lib/util'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

/**
 * Экран код-пароля.
 *
 * Рисуется поверх всего и с непрозрачным фоном: смысл замка в том, чтобы
 * переписку не было видно через блюр.
 *
 * Забытый код не должен превращать приложение в кирпич, поэтому внизу
 * всегда есть выход из аккаунта: замок локальный, аккаунт цел.
 */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const cfg = getLock()
  const logout = useStore((s) => s.logout)
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'pin' | 'totp'>('pin')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)
  const [tries, setTries] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (stage === 'totp') codeRef.current?.focus()
  }, [stage])

  function fail() {
    setShake(true)
    setTries((t) => t + 1)
    setTimeout(() => setShake(false), 420)
  }

  async function submitPin(value: string) {
    if (busy) return
    setBusy(true)
    try {
      const ok = await verifyPin(value)
      if (!ok) {
        setPin('')
        fail()
        return
      }
      if (cfg?.totp) {
        setStage('totp')
        return
      }
      markUnlocked()
      onUnlock()
    } finally {
      setBusy(false)
    }
  }

  async function submitCode() {
    if (busy || !cfg?.totp) return
    setBusy(true)
    try {
      const ok = await verifyTotp(cfg.totp, code)
      if (!ok) {
        setCode('')
        fail()
        return
      }
      markUnlocked()
      onUnlock()
    } finally {
      setBusy(false)
    }
  }

  function press(k: string) {
    if (k === '') return
    if (k === '⌫') return setPin((p) => p.slice(0, -1))
    const next = (pin + k).slice(0, 8)
    setPin(next)
    if (next.length >= 4 && next.length === (pin + k).length && next.length >= 4) {
      // Проверяем на четырёх цифрах и дальше при каждом вводе: код может быть длиннее.
      void submitPin(next)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stage !== 'pin') return
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Enter' && pin.length >= 4) void submitPin(pin)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="safe-top safe-bottom fixed inset-0 z-[120] flex flex-col items-center justify-center bg-[var(--panel)] px-6">
      <div className={classNames('flex w-full max-w-xs flex-col items-center', shake && 'animate-pop-in')}>
        <div className="grid h-16 w-16 place-items-center rounded-3xl accent-gradient text-3xl text-white shadow-lg">🔒</div>
        <div className="mt-3 text-lg font-black">
          {stage === 'pin' ? 'Введите код-пароль' : 'Код из приложения'}
        </div>
        <div className="mt-1 text-center text-xs text-[var(--muted)]">
          {stage === 'pin' ? 'FemboyChat закрыт на этом устройстве' : 'Шесть цифр из вашего аутентификатора'}
        </div>

        {stage === 'pin' ? (
          <>
            <div className={classNames('mt-6 flex items-center gap-3', shake && 'animate-shake')}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={classNames(
                    'h-3.5 w-3.5 rounded-full border transition',
                    pin.length > i ? 'border-transparent accent-gradient' : 'border-[var(--border)] bg-[var(--panel-2)]',
                  )}
                />
              ))}
              {pin.length > 4 && <span className="text-xs text-[var(--muted)]">+{pin.length - 4}</span>}
            </div>

            <div className="mt-7 grid w-full grid-cols-3 gap-3">
              {KEYS.map((k, i) => (
                <button
                  key={i}
                  onClick={() => press(k)}
                  disabled={busy || k === ''}
                  className={classNames(
                    'h-16 rounded-2xl text-2xl font-semibold transition select-none',
                    k === '' ? 'pointer-events-none opacity-0' : 'bg-[var(--panel-2)] hover:bg-[var(--panel-hover)] active:scale-95',
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-6 w-full space-y-3">
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && void submitCode()}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={classNames('input text-center text-2xl tracking-[0.4em]', shake && 'animate-shake')}
            />
            <button onClick={() => void submitCode()} disabled={busy || code.length !== 6} className="btn-primary w-full disabled:opacity-50">
              Подтвердить
            </button>
          </div>
        )}

        {tries > 0 && (
          <p className="mt-4 text-center text-xs text-rose-400">
            Неверный код{tries > 2 ? ' — если забыли, выйдите и войдите заново' : ''}
          </p>
        )}

        <button
          onClick={async () => {
            if (!confirm('Выйти из аккаунта? Код-пароль сбросится, переписка останется на сервере.')) return
            localStorage.removeItem('fc:lock')
            await logout()
            location.reload()
          }}
          className="mt-6 text-xs font-semibold text-[var(--muted)] hover:underline"
        >
          Забыли код? Выйти из аккаунта
        </button>
      </div>
    </div>
  )
}
