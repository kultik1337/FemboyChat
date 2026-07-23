import { useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, MailCheck, Sparkles } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { isValidEmail, normalizeUsername } from '../../lib/util'

export function Auth() {
  const goto = useStore((s) => s.goto)
  const requestCode = useStore((s) => s.requestCode)
  const verifyCode = useStore((s) => s.verifyCode)
  const mode = useStore((s) => s.mode)
  const supa = mode === 'supabase'

  const [step, setStep] = useState<'form' | 'code'>('form')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function onRequest(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!supa && !isValidEmail(email)) return setError('Введите корректный e-mail')
    if (normalizeUsername(username).length < 3) return setError('Юзернейм — минимум 3 символа (a-z, 0-9, _)')
    setLoading(true)
    const res = await requestCode(email, username, name)
    if (res.ok && supa) {
      // Supabase mode = anonymous sign-in: no email/code, finish immediately.
      const ok = await verifyCode(email, res.devCode ?? '000000')
      setLoading(false)
      if (!ok) setError('Не удалось войти. Проверь, что в Supabase включён Anonymous sign-in.')
      return
    }
    setLoading(false)
    if (!res.ok) return setError(res.error ?? 'Что-то пошло не так')
    setIsNew(res.isNew)
    setDevCode(res.devCode ?? null)
    setStep('code')
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (code.trim().length < 4) return setError('Введите код из письма')
    setLoading(true)
    const ok = await verifyCode(email, code)
    setLoading(false)
    if (!ok) setError('Неверный или просроченный код')
  }

  return (
    <div
      className="grid min-h-full place-items-center p-4"
      style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}
    >
      <div className="w-full max-w-md">
        <button
          onClick={() => (step === 'code' ? setStep('form') : goto('landing'))}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={16} /> Назад
        </button>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-7 shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="mb-6 flex items-center gap-2 font-extrabold">
            <span className="grid h-10 w-10 place-items-center rounded-xl accent-gradient text-white shadow-md">💬</span>
            <span className="text-xl">Femboy<span className="accent-text">Chat</span></span>
          </div>

          {step === 'form' ? (
            <form onSubmit={onRequest} className="space-y-4">
              <div>
                <h1 className="text-2xl font-black">Вход или регистрация</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {supa ? 'Просто выбери ник и заходи — без пароля и почты 🎀' : 'Без пароля — пришлём код на почту.'}
                </p>
              </div>
              {!supa && (
                <Field label="E-mail">
                  <input
                    autoFocus
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input"
                  />
                </Field>
              )}
              <Field label="Юзернейм" hint="твой @ник">
                <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 focus-within:ring-2 focus-within:ring-[var(--ring)]">
                  <span className="text-[var(--muted)]">@</span>
                  <input
                    autoFocus={supa}
                    value={username}
                    onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                    placeholder="femboy_star"
                    className="w-full bg-transparent px-1 py-2.5 outline-none"
                  />
                </div>
              </Field>
              <Field label="Отображаемое имя" hint="можно оставить пустым">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Мия" className="input" />
              </Field>

              {error && <p className="text-sm font-medium text-rose-500">{error}</p>}

              <button disabled={loading} className="btn-primary w-full">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <>{supa ? 'Войти' : 'Получить код'} <ArrowRight size={18} /></>}
              </button>
              <p className="text-center text-xs text-[var(--muted)]">
                {supa ? 'Вход мгновенный, по нику 💗' : mode === 'local' ? 'Демо-режим: код появится прямо здесь.' : 'Код придёт на указанную почту.'}
              </p>
            </form>
          ) : (
            <form onSubmit={onVerify} className="space-y-4">
              <div className="flex flex-col items-center text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl accent-gradient text-white">
                  <MailCheck size={26} />
                </div>
                <h1 className="mt-4 text-2xl font-black">Проверьте почту</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Код отправлен на <b className="text-[var(--text)]">{email}</b>
                </p>
              </div>

              {devCode && (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--accent)] bg-[var(--panel-2)] p-3 text-sm">
                  <Sparkles size={15} className="text-[var(--accent)]" />
                  Демо-код: <button type="button" onClick={() => setCode(devCode)} className="font-mono text-lg font-black accent-text">{devCode}</button>
                </div>
              )}

              <input
                autoFocus
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="• • • • • •"
                className="input text-center text-2xl font-black tracking-[0.5em]"
              />

              {error && <p className="text-center text-sm font-medium text-rose-500">{error}</p>}

              <button disabled={loading} className="btn-primary w-full">
                {loading ? <Loader2 className="animate-spin" size={18} /> : isNew ? 'Создать аккаунт' : 'Войти'}
              </button>
              <button type="button" onClick={onRequest} className="w-full text-center text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)]">
                Отправить код ещё раз
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
