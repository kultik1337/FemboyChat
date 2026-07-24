import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Logo } from '../ui/Logo'
import { normalizeUsername } from '../../lib/util'

export function Auth() {
  const goto = useStore((s) => s.goto)
  const register = useStore((s) => s.register)
  const login = useStore((s) => s.login)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isRegister = mode === 'register'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (normalizeUsername(username).length < 3) return setError('Ник — минимум 3 символа (a-z, 0-9, _)')
    if (password.length < 6) return setError('Пароль — минимум 6 символов')
    setLoading(true)
    const ok = isRegister ? await register(username, name, password) : await login(username, password)
    setLoading(false)
    if (!ok) setError(isRegister ? 'Не удалось зарегистрироваться' : 'Не удалось войти')
  }

  return (
    <div
      className="grid min-h-full place-items-center p-4"
      style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}
    >
      <div className="w-full max-w-md">
        <button
          onClick={() => goto('landing')}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)]"
        >
          ← На главную
        </button>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-7 shadow-xl animate-pop-in" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="mb-6 flex items-center gap-2 font-extrabold">
            <Logo size={40} />
            <span className="text-xl">Femboy<span className="accent-text">Chat</span></span>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-[var(--panel-2)] p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError('') }}
                className={
                  'rounded-xl py-2 text-sm font-bold transition ' +
                  (mode === m ? 'accent-gradient text-white shadow' : 'text-[var(--muted)] hover:text-[var(--text)]')
                }
              >
                {m === 'login' ? 'Вход' : 'Регистрация'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <h1 className="text-2xl font-black">{isRegister ? 'Создать аккаунт' : 'С возвращением 🎀'}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {isRegister ? 'Придумай ник и пароль — вход потом по ним же.' : 'Введи свой ник и пароль, чтобы войти.'}
              </p>
            </div>

            <Field label="Ник" hint="твой @логин">
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 focus-within:ring-2 focus-within:ring-[var(--ring)]">
                <span className="text-[var(--muted)]">@</span>
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                  placeholder="femboy_star"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full bg-transparent px-1 py-2.5 outline-none"
                />
              </div>
            </Field>

            {isRegister && (
              <Field label="Отображаемое имя" hint="можно оставить пустым">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Мия" className="input" />
              </Field>
            )}

            <Field label="Пароль">
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 focus-within:ring-2 focus-within:ring-[var(--ring)]">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? 'минимум 6 символов' : 'твой пароль'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="w-full bg-transparent py-2.5 pr-1 outline-none"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--panel-hover)]">
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>

            {error && <p className="text-sm font-medium text-rose-500">{error}</p>}

            <button disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>{isRegister ? 'Зарегистрироваться' : 'Войти'} <ArrowRight size={18} /></>}
            </button>

            <p className="text-center text-xs text-[var(--muted)]">
              {isRegister ? (
                <>Уже есть аккаунт?{' '}
                  <button type="button" onClick={() => { setMode('login'); setError('') }} className="font-semibold accent-text">Войти</button>
                </>
              ) : (
                <>Нет аккаунта?{' '}
                  <button type="button" onClick={() => { setMode('register'); setError('') }} className="font-semibold accent-text">Создать</button>
                </>
              )}
            </p>
          </form>
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
