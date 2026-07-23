import {
  ArrowRight,
  BellRing,
  Bot,
  Check,
  Fingerprint,
  Ghost,
  Hash,
  Heart,
  Lock,
  MessageCircle,
  Palette,
  Search,
  Sparkles,
  Timer,
  Users,
  Zap,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { Logo } from '../ui/Logo'

const features = [
  { icon: Zap, title: 'Реальное время', text: 'Сообщения, статусы «печатает…» и отметки о прочтении прилетают мгновенно — без обновления страницы.' },
  { icon: Fingerprint, title: 'Без паролей', text: 'Вход по одноразовому коду на почту. Нечего забывать и нечего украсть.' },
  { icon: Search, title: 'Умный поиск', text: 'Одно поле — и люди, каналы, группы и боты находятся сразу. Ищи по имени, @юзернейму или номеру.' },
  { icon: Hash, title: 'Числовой ID', text: 'Каждый аккаунт получает порядковый номер — тот самый, «каким по счёту» ты присоединился.' },
  { icon: Palette, title: 'Красивые темы', text: 'Пастель, «Catgirl Night», акцентные цвета, обои чата и размер текста — настрой под себя.' },
  { icon: Bot, title: 'Боты и команды', text: 'Встроенные боты отвечают на /команды. Платформа готова к своим ботам.' },
  { icon: Ghost, title: 'Приватность', text: 'Режим-призрак, контроль «последнего входа» и того, кто может тебе писать.' },
  { icon: Timer, title: 'Исчезающие сообщения', text: 'Таймер самоуничтожения для особо личного 🔥' },
]

const faq = [
  { q: 'Что такое FemboyChat?', a: 'Тёплый, современный мессенджер для РУ-сегмента — с акцентом на уют, эстетику и приватность. Аналог привычных мессенджеров, но со своим характером.' },
  { q: 'Почему без пароля?', a: 'Пароли устаревают, утекают и забываются. Мы отправляем одноразовый код на почту — это проще и безопаснее.' },
  { q: 'Это правда работает в реальном времени?', a: 'Да. Открой сайт в двух вкладках, войди в разные аккаунты и пиши — сообщения появляются мгновенно в обеих.' },
  { q: 'Мои данные в безопасности?', a: 'В демо-режиме всё хранится локально в твоём браузере и никуда не уходит. Для продакшена подключается защищённый бэкенд.' },
]

export function Landing() {
  const goto = useStore((s) => s.goto)
  return (
    <div
      className="min-h-full overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}
    >
      {/* nav */}
      <header className="sticky top-0 z-20 glass border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2 font-extrabold">
            <Logo size={36} />
            <span className="text-lg">Femboy<span className="accent-text">Chat</span></span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goto('auth')}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)]"
            >
              Войти
            </button>
            <button
              onClick={() => goto('auth')}
              className="rounded-full accent-gradient px-4 py-2 text-sm font-bold text-white shadow-md transition hover:brightness-105"
            >
              Начать
            </button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
        <div className="animate-slide-up">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            <Sparkles size={13} className="text-[var(--accent)]" /> Новый дом для своих
          </span>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
            Мессенджер, в котором <span className="accent-text">тепло</span> и по-своему.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-[var(--muted)]">
            FemboyChat — быстрый real-time мессенджер с эстетикой, приватностью и характером. Вход без пароля, поиск всего
            и сразу, красивые настройки и куча милых деталей 🎀
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
              <Lock size={15} /> Без пароля · код на почту
            </div>
          </div>
          <div className="mt-8 flex items-center gap-5 text-sm text-[var(--muted)]">
            <Stat value="< 50мс" label="задержка" />
            <Stat value="∞" label="стикеров" />
            <Stat value="0" label="паролей" />
          </div>
        </div>

        <PhoneMock />
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="text-center text-3xl font-black md:text-4xl">Всё, чтобы общаться было в кайф</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[var(--muted)]">
          Мы собрали лучшее из современных мессенджеров и добавили тепла.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
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
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-8 md:p-12" style={{ boxShadow: 'var(--shadow)' }}>
          <h2 className="text-3xl font-black">Как это работает</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <Step n={1} title="Почта + юзернейм" text="Указываешь e-mail и придумываешь @юзернейм. Пароль не нужен." icon={<MessageCircle size={18} />} />
            <Step n={2} title="Код на почту" text="Присылаем 6-значный код. Вводишь — и ты внутри." icon={<BellRing size={18} />} />
            <Step n={3} title="Твой номер #" text="Получаешь порядковый ID и начинаешь общаться в реальном времени." icon={<Hash size={18} />} />
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-center text-3xl font-black">Частые вопросы</h2>
        <div className="mt-8 space-y-3">
          {faq.map((f) => (
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
          <h2 className="text-3xl font-black md:text-4xl">Готов(а) присоединиться?</h2>
          <p className="mx-auto mt-3 max-w-md opacity-90">Создай аккаунт за 20 секунд и получи свой личный номер.</p>
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

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-sm animate-float">
      <div className="rounded-[2.2rem] border border-[var(--border)] bg-[var(--panel)] p-3 shadow-2xl" style={{ boxShadow: 'var(--shadow)' }}>
        <div className="rounded-[1.7rem] wallpaper-aurora p-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full accent-gradient text-white">🦊</span>
            <div>
              <div className="text-sm font-bold">Sezotai</div>
              <div className="text-[11px] text-emerald-500">печатает…</div>
            </div>
          </div>
          <Bubble side="in">привет! 🎀 видел новую тёмную тему?</Bubble>
          <Bubble side="out">да, «Catgirl Night» просто 🔥</Bubble>
          <Bubble side="in">и акцент можно менять 😳✨</Bubble>
          <Bubble side="out">всё как надо 💜</Bubble>
        </div>
      </div>
    </div>
  )
}

function Bubble({ side, children }: { side: 'in' | 'out'; children: React.ReactNode }) {
  const out = side === 'out'
  return (
    <div className={`mb-2 flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm"
        style={
          out
            ? { background: 'var(--bubble-out)', color: 'var(--bubble-out-text)' }
            : { background: 'var(--bubble-in)', color: 'var(--bubble-in-text)' }
        }
      >
        {children}
        {out && <Check size={12} className="ml-1 inline opacity-80" />}
      </div>
    </div>
  )
}
