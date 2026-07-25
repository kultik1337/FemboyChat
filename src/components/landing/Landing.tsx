import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCheck,
  Eye,
  Heart,
  Image as ImageIcon,
  Lock,
  Mic,
  Moon,
  Palette,
  Play,
  ShieldCheck,
  Smile,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Logo } from '../ui/Logo'

const FEATURES = [
  { icon: Mic, title: 'Голосовые с волной', text: 'Свой красивый плеер: waveform, перемотка и скорость 1×/1.5×/2×.' },
  { icon: ImageIcon, title: 'Фото, видео, файлы и GIF', text: 'Drag&drop прямо в чат, вставка из буфера, подписи и аниме-GIF-пикер.' },
  { icon: Smile, title: 'Реакции как ты любишь', text: 'Пилюльки прямо в сообщении. Любой эмодзи — хоть 🦑.' },
  { icon: Eye, title: 'Спойлеры', text: 'Скрой фото или видео за размытием — откроется только по клику.' },
  { icon: Zap, title: 'Реальное время', text: '«Печатает…», статусы онлайн и галочки прочтения — мгновенно.' },
  { icon: Palette, title: 'Твоя эстетика', text: '4 темы (включая «как в системе»), акцентные цвета, обои и свои аватарки.' },
  { icon: ShieldCheck, title: 'Приватность', text: 'Режим-призрак, контроль «был(а) в сети» и того, кто может писать.' },
  { icon: Timer, title: 'Исчезающие сообщения', text: 'Таймер самоуничтожения для особо личного 🔥' },
]

const MARQUEE = ['🎀 стикеры', '🎤 голосовые', '🖼 аниме-GIF', '💗 реакции', '🙈 спойлеры', '📎 файлы', '🌗 авто-тема', '🫵 @упоминания', '📊 опросы', '⏱ исчезающие', '🔍 умный поиск', '🧦 programmer socks']

const FAQ = [
  { q: 'Что такое FemboyChat?', a: 'Тёплый, современный мессенджер для РУ-сегмента — с акцентом на уют, эстетику и приватность. Всё, что ты ждёшь от мессенджера: медиа, голосовые, реакции, группы и боты — но со своим характером.' },
  { q: 'Как зарегистрироваться?', a: 'Почта + @юзернейм + пароль. Мы пришлём письмо для подтверждения — один клик, и ты внутри со своим порядковым номером аккаунта.' },
  { q: 'Это правда работает в реальном времени?', a: 'Да. Сообщения, «печатает…» и галочки прочтения прилетают мгновенно на все твои устройства — без обновления страницы.' },
  { q: 'Что можно отправлять?', a: 'Текст с форматированием, фото, видео, любые файлы, голосовые с красивым плеером, аниме-гифки, стикеры и опросы. К медиа можно добавить подпись или спрятать его за спойлером.' },
  { q: 'Мои данные в безопасности?', a: 'Доступ к сообщениям защищён политиками на уровне базы данных: чужие переписки нельзя прочитать даже напрямую через API. Файлы каждый может загружать только в свою папку.' },
]

/** Приветствие по времени суток — маленькая тёплая деталь. */
function greeting() {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return { text: 'Доброе утро', emoji: '🌅' }
  if (h >= 12 && h < 18) return { text: 'Добрый день', emoji: '🌸' }
  if (h >= 18 && h < 23) return { text: 'Добрый вечер', emoji: '🌆' }
  return { text: 'Доброй ночи', emoji: '🌙' }
}

export function Landing() {
  const goto = useStore((s) => s.goto)
  const hi = useMemo(greeting, [])

  return (
    <div className="landing-bg min-h-full overflow-y-auto">
      {/* decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="landing-blob left-[-10%] top-[-10%] h-[420px] w-[420px]" style={{ background: 'var(--accent)' }} />
        <div className="landing-blob right-[-8%] top-[20%] h-[360px] w-[360px]" style={{ background: 'var(--accent-2)', animationDelay: '-4s' }} />
        <div className="landing-blob bottom-[-12%] left-[30%] h-[380px] w-[380px]" style={{ background: '#b388ff', animationDelay: '-8s' }} />
      </div>

      <div className="relative">
        {/* nav */}
        <header className="sticky top-0 z-20 glass border-b border-[var(--border)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2 font-extrabold">
              <Logo size={36} />
              <span className="text-lg">Femboy<span className="accent-text">Chat</span></span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => goto('auth')} className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)]">
                Войти
              </button>
              <button onClick={() => goto('auth')} className="rounded-full accent-gradient px-4 py-2 text-sm font-bold text-white shadow-md transition hover:brightness-105">
                Начать
              </button>
            </div>
          </div>
        </header>

        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div className="animate-slide-up">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
              {hi.emoji} {hi.text}! Добро пожаловать домой
            </span>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
              Мессенджер,<br />в котором <span className="accent-text">тепло</span>.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-[var(--muted)]">
              Голосовые с красивой волной, аниме-гифки, реакции, спойлеры и свои аватарки. Быстро, приватно и очень мило 🎀
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => goto('auth')}
                className="group flex items-center gap-2 rounded-full accent-gradient px-6 py-3 font-bold text-white shadow-lg transition hover:brightness-105"
              >
                Создать аккаунт
                <ArrowRight size={18} className="transition group-hover:translate-x-0.5" />
              </button>
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <Lock size={15} /> Бесплатно · регистрация за 20 секунд
              </div>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-[var(--muted)]">
              <Stat value="< 50мс" label="доставка" />
              <Stat value="18" label="категорий GIF" />
              <Stat value="2×" label="скорость голосовых" />
              <Stat value="∞" label="уюта" />
            </div>
          </div>

          <ChatDemo />
        </section>

        {/* marquee */}
        <div className="border-y border-[var(--border)] bg-[var(--panel)]/60 py-3 backdrop-blur">
          <div className="landing-marquee flex gap-3 whitespace-nowrap">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i} className="chip shrink-0">{m}</span>
            ))}
          </div>
        </div>

        {/* features */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-center text-3xl font-black md:text-4xl">Всё, чтобы общаться было в кайф</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[var(--muted)]">
            Собрали лучшее из современных мессенджеров, добавили тепла и ня.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:-translate-y-1"
                style={{ boxShadow: 'var(--shadow)' }}
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl accent-gradient text-white">
                  <f.icon size={20} />
                </div>
                <h3 className="mt-4 font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--muted)]">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-8 md:p-12" style={{ boxShadow: 'var(--shadow)' }}>
            <h2 className="text-3xl font-black">Как это работает</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <Step n={1} title="Почта + ник + пароль" text="Придумываешь @юзернейм — он твой навсегда." icon={<Sparkles size={18} />} />
              <Step n={2} title="Подтверди почту" text="Один клик по кнопке в письме — и аккаунт активен." icon={<ShieldCheck size={18} />} />
              <Step n={3} title="Твой номер #" text="Получаешь порядковый ID и залетаешь в общие чаты." icon={<Heart size={18} />} />
            </div>
          </div>
        </section>

        {/* themes teaser */}
        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="grid gap-4 md:grid-cols-3">
            <ThemeCard name="Пастель" emoji="🌸" bg="linear-gradient(135deg,#ffe3f3,#e3f0ff)" text="#2a2230" />
            <ThemeCard name="Catgirl Night" emoji="🐈‍⬛" bg="linear-gradient(135deg,#1d1526,#101820)" text="#f4eefb" />
            <ThemeCard name="Programmer Socks" emoji="🧦" bg="linear-gradient(135deg,#101a33,#1a1030)" text="#eaf0ff" />
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm text-[var(--muted)]">
            <Moon size={14} /> Плюс режим «как в системе» — темнеет вместе с твоей ОС
          </p>
        </section>

        {/* faq */}
        <section className="mx-auto max-w-3xl px-5 pb-10">
          <h2 className="text-center text-3xl font-black">Частые вопросы</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {f.q}
                  <span className="text-[var(--accent)] transition group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-3 text-sm text-[var(--muted)]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* cta */}
        <section className="mx-auto max-w-4xl px-5 py-16">
          <div className="relative overflow-hidden rounded-3xl accent-gradient p-10 text-center text-white shadow-xl md:p-14">
            <div className="absolute -right-8 -top-8 text-9xl opacity-20">💖</div>
            <div className="absolute -bottom-10 -left-6 text-9xl opacity-15">🎀</div>
            <h2 className="text-3xl font-black md:text-4xl">Ня. Заходи.</h2>
            <p className="mx-auto mt-3 max-w-md opacity-90">Твой номер аккаунта уже ждёт. Чем раньше зайдёшь — тем он короче 😉</p>
            <button
              onClick={() => goto('auth')}
              className="mt-7 rounded-full bg-white px-7 py-3 font-bold text-[var(--accent)] shadow-md transition hover:scale-[1.03]"
            >
              Войти в FemboyChat
            </button>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-[var(--muted)]">
          <div className="flex items-center justify-center gap-1.5">
            Сделано с <Heart size={13} className="text-[var(--accent)]" /> для РУ-сообщества · FemboyChat
          </div>
        </footer>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-xl font-black text-[var(--text)]">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  )
}

function Step({ n, title, text, icon }: { n: number; title: string; text: string; icon: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-5">
      <div className="flex items-center gap-2 text-[var(--accent)]">
        <span className="grid h-8 w-8 place-items-center rounded-full accent-gradient text-sm font-black text-white">{n}</span>
        {icon}
      </div>
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">{text}</p>
    </div>
  )
}

function ThemeCard({ name, emoji, bg, text }: { name: string; emoji: string; bg: string; text: string }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--border)]" style={{ boxShadow: 'var(--shadow)' }}>
      <div className="p-5" style={{ background: bg, color: text }}>
        <div className="mb-3 text-2xl">{emoji}</div>
        <div className="mb-2 max-w-[75%] rounded-2xl rounded-bl-md px-3 py-1.5 text-xs" style={{ background: 'rgba(127,127,127,0.18)' }}>привет! как тебе тема?</div>
        <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-md accent-gradient px-3 py-1.5 text-right text-xs text-white">просто 🔥</div>
      </div>
      <div className="bg-[var(--panel)] px-5 py-3 text-sm font-bold">{name}</div>
    </div>
  )
}

// ── Живое демо чата: сообщения появляются сами, по кругу ──

type DemoMsg =
  | { kind: 'text'; side: 'in' | 'out'; text: string; reactions?: string[] }
  | { kind: 'voice'; side: 'in' | 'out' }
  | { kind: 'photo'; side: 'in' | 'out' }

const SCRIPT: DemoMsg[] = [
  { kind: 'text', side: 'in', text: 'привет! 🎀 ты уже видел новые голосовые?' },
  { kind: 'voice', side: 'out' },
  { kind: 'text', side: 'in', text: 'ВОЛНА! и скорость 2× есть 😳', reactions: ['💗'] },
  { kind: 'photo', side: 'out' },
  { kind: 'text', side: 'in', text: 'фотка без рамок, как в телеге ✨' },
  { kind: 'text', side: 'out', text: 'а ещё спойлеры, гифки и реакции 😏', reactions: ['🔥', '😳'] },
]

const DEMO_BARS = [8, 14, 20, 12, 24, 16, 10, 22, 18, 9, 15, 23, 11, 19, 13, 21, 10, 16, 24, 12, 18, 8, 14, 20]

function ChatDemo() {
  const [count, setCount] = useState(1)
  const [typing, setTyping] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const tick = () => {
      if (!alive) return
      setTyping(true)
      setTimeout(() => {
        if (!alive) return
        setTyping(false)
        setCount((c) => (c >= SCRIPT.length ? 1 : c + 1))
      }, 900)
    }
    const iv = setInterval(tick, 2400)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count, typing])

  const shown = SCRIPT.slice(0, count)

  return (
    <div className="relative mx-auto w-full max-w-sm animate-float">
      <div className="rounded-[2.2rem] border border-[var(--border)] bg-[var(--panel)] p-3 shadow-2xl" style={{ boxShadow: 'var(--shadow)' }}>
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="grid h-9 w-9 place-items-center rounded-full accent-gradient text-white">🦊</span>
          <div>
            <div className="text-sm font-bold">Sezotai</div>
            <div className="text-[11px] text-emerald-500">{typing ? 'печатает…' : 'в сети'}</div>
          </div>
        </div>
        <div ref={boxRef} className="no-scrollbar h-[340px] overflow-y-auto rounded-[1.7rem] wallpaper-aurora p-3">
          {shown.map((m, i) => <DemoBubble key={i} m={m} />)}
          {typing && (
            <div className="mb-2 flex justify-start">
              <span className="inline-flex items-center gap-1 rounded-2xl px-3 py-2 shadow-sm" style={{ background: 'var(--bubble-in)' }}>
                <DemoDot d={0} /> <DemoDot d={0.15} /> <DemoDot d={0.3} />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DemoDot({ d }: { d: number }) {
  return <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted)]" style={{ animationDelay: `${d}s` }} />
}

function DemoBubble({ m }: { m: DemoMsg }) {
  const out = m.side === 'out'
  const wrap = `mb-2 flex ${out ? 'justify-end' : 'justify-start'}`
  const bubbleStyle = out
    ? { background: 'var(--bubble-out)', color: 'var(--bubble-out-text)' }
    : { background: 'var(--bubble-in)', color: 'var(--bubble-in-text)' }

  if (m.kind === 'voice') {
    return (
      <div className={`${wrap} animate-pop-in`}>
        <div className="flex max-w-[85%] items-center gap-2 rounded-2xl px-3 py-2 shadow-sm" style={bubbleStyle}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-current/20">
            <Play size={13} fill="currentColor" className="ml-0.5" />
          </span>
          <span className="flex h-6 items-center gap-[2px]">
            {DEMO_BARS.map((h, i) => (
              <span key={i} className={`w-[3px] rounded-full bg-current ${i < 9 ? 'opacity-95' : 'opacity-35'}`} style={{ height: h }} />
            ))}
          </span>
          <span className="text-[10px] opacity-80">0:07</span>
        </div>
      </div>
    )
  }

  if (m.kind === 'photo') {
    return (
      <div className={`${wrap} animate-pop-in`}>
        <div className="relative w-[70%] overflow-hidden rounded-2xl shadow-sm">
          <div className="grid aspect-[4/3] place-items-center text-4xl" style={{ background: 'linear-gradient(135deg, var(--accent), #b388ff, var(--accent-2))' }}>
            🐱
          </div>
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-1 text-[9px] leading-none text-white">
            22:47 <CheckCheck size={11} />
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`${wrap} animate-pop-in`}>
      <div className="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm" style={bubbleStyle}>
        {m.text}
        <span className="ml-1.5 align-middle text-[9px] opacity-70">
          {out ? <Check size={11} className="inline" /> : null}
        </span>
        {m.reactions && (
          <div className="mt-1 flex gap-1">
            {m.reactions.map((r) => (
              <span key={r} className={`flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[10px] font-bold ${out ? 'bg-white/25' : 'bg-[var(--accent)]/15'}`}>
                {r} 1
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
