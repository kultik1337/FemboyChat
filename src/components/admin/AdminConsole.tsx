/*
  Отдельная страница админ-управления (маршрут #admin).

  Доступ: клиент скрывает страницу по usePerks().is_admin, но это только UI.
  Настоящая граница — в базе: каждая admin_* RPC первым делом проверяет
  fc_is_admin() и выдана только роли authenticated. Подмена флага в браузере
  не даёт ни одного байта данных.

  Оформление берёт только те токены, которые реально есть в index.css:
  --panel, --panel-2, --panel-hover, --border, --text, --muted, --accent.
  Любая выдуманная переменная — это невалидный цвет, то есть молча
  исчезающая рамка или фон, а не ошибка сборки.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { usePerks, invalidatePerks } from '../../lib/perks'
import {
  ADMIN_PAGE_SIZE,
  adminBanUser,
  adminDeleteChat,
  adminDeleteMessage,
  adminListAudit,
  adminListChats,
  adminListReports,
  adminListUsers,
  adminOverview,
  adminResolveReport,
  adminSearchMessages,
  adminSetChatVerified,
  adminSetMaxBots,
  adminSetPerk,
  adminSetVerified,
  adminUnbanUser,
  auditLabel,
  fmtDate,
  fmtNum,
  isBanned,
  type AdminAuditAction,
  type AdminAuditEntry,
  type AdminChat,
  type AdminMessage,
  type AdminOverview,
  type AdminReport,
  type AdminUser,
  type ReportStatus,
} from '../../lib/admin'

type Tab = 'overview' | 'users' | 'chats' | 'messages' | 'reports' | 'audit'

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'overview', label: 'Обзор', icon: '📊' },
  { key: 'users', label: 'Люди', icon: '👥' },
  { key: 'chats', label: 'Чаты', icon: '💬' },
  { key: 'messages', label: 'Сообщения', icon: '🔎' },
  { key: 'reports', label: 'Жалобы', icon: '🚩' },
  { key: 'audit', label: 'Журнал', icon: '🧾' },
]

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ── мелкие примитивы ──────────────────────────── */

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx('rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4', className)}
      style={{ boxShadow: 'var(--shadow)' }}
    >
      {children}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel className="flex flex-col gap-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="text-2xl font-black text-[var(--text)]">{value}</div>
      {hint && <div className="text-xs text-[var(--muted)]">{hint}</div>}
    </Panel>
  )
}

function Btn({
  children,
  onClick,
  tone = 'ghost',
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  tone?: 'ghost' | 'primary' | 'danger'
  disabled?: boolean
  title?: string
}) {
  const tones = {
    ghost: 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:bg-[var(--panel-hover)]',
    primary: 'accent-gradient border-transparent text-white hover:brightness-110',
    danger: 'border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20',
  }
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-40',
        tones[tone],
      )}
    >
      {children}
    </button>
  )
}

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'good' | 'bad' | 'warn' }) {
  const tones = {
    muted: 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]',
    good: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
    bad: 'border-rose-500/30 bg-rose-500/15 text-rose-400',
    warn: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  }
  return (
    <span className={cx('rounded-lg border px-1.5 py-0.5 text-[11px] font-bold', tones[tone])}>{children}</span>
  )
}

/** Ряд кнопок-фильтров — один вид для жалоб и журнала. */
function FilterRow<T extends string>({
  items,
  value,
  onPick,
}: {
  items: Array<{ key: T; label: string }>
  value: T
  onPick: (key: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onPick(s.key)}
          className={cx(
            'rounded-xl border px-3 py-1.5 text-xs font-semibold transition',
            value === s.key
              ? 'accent-gradient border-transparent text-white'
              : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:bg-[var(--panel-hover)]',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
}) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
        placeholder={placeholder}
        className="input min-w-0 flex-1 text-sm"
      />
      <Btn tone="primary" onClick={onSubmit}>
        Найти
      </Btn>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-[var(--muted)]">{text}</div>
}

/**
 * Перелистывание списков админки.
 *
 * RPC отдают голый массив без общего числа строк, и это намеренно:
 * count(*) по messages на каждый поиск — полный проход по таблице ради
 * одного числа в углу. Поэтому «Далее» активна ровно тогда, когда страница
 * пришла полной. Плата за это: если строк ровно кратно размеру страницы,
 * последний переход покажет пустой список.
 */
function Pager({
  page,
  count,
  loading,
  onPage,
}: {
  page: number
  count: number
  loading?: boolean
  onPage: (next: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const hasMore = count === ADMIN_PAGE_SIZE

  // Одна неполная страница — перелистывать нечего.
  if (page === 0 && !hasMore) return null

  const go = (next: number) => {
    onPage(next)
    // Новая страница должна начинаться сверху, а не там, где была кнопка.
    box.current?.closest('main')?.scrollTo({ top: 0 })
  }

  const from = page * ADMIN_PAGE_SIZE + 1
  const to = page * ADMIN_PAGE_SIZE + count

  return (
    <div ref={box} className="flex items-center justify-between gap-2 pt-1">
      <Btn disabled={page === 0 || loading} onClick={() => go(page - 1)}>
        ← Назад
      </Btn>
      <div className="text-xs tabular-nums text-[var(--muted)]">
        {count === 0 ? 'пусто' : `${fmtNum(from)}–${fmtNum(to)}`} · стр. {page + 1}
      </div>
      <Btn disabled={!hasMore || loading} onClick={() => go(page + 1)}>
        Далее →
      </Btn>
    </div>
  )
}

/* ── вкладка: обзор ───────────────────────────── */

function OverviewTab() {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setData(await adminOverview())
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const days = useMemo(
    () => (data?.daily ?? []).map((d) => ({ day: d.day, value: Number(d.messages) || 0 })),
    [data],
  )
  const maxDaily = useMemo(() => Math.max(1, ...days.map((d) => d.value)), [days])
  const sumDaily = useMemo(() => days.reduce((a, d) => a + d.value, 0), [days])

  if (loading && !data) return <Empty text="Считаем…" />
  if (!data) return <Empty text="Не удалось загрузить статистику" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--muted)]">Сводка по всему проекту</div>
        <Btn onClick={() => void load()}>Обновить</Btn>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Люди" value={fmtNum(data.users)} hint={'+' + fmtNum(data.new_users_7d) + ' за неделю'} />
        <Stat label="Онлайн" value={fmtNum(data.online)} hint="за последние 5 минут" />
        <Stat label="Сообщения" value={fmtNum(data.messages)} hint={fmtNum(data.messages_24h) + ' за сутки'} />
        <Stat label="Чаты" value={fmtNum(data.chats)} hint={fmtNum(data.groups) + ' групп · ' + fmtNum(data.channels) + ' каналов'} />
        <Stat label="Личные диалоги" value={fmtNum(data.dms)} />
        <Stat label="Боты" value={fmtNum(data.bots)} />
        <Stat label="Вложения" value={fmtNum(data.attachments)} />
        <Stat
          label="Требует внимания"
          value={fmtNum(data.reports_open) + ' / ' + fmtNum(data.banned)}
          hint="открытых жалоб / банов"
        />
      </div>

      <Panel>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-bold text-[var(--text)]">Сообщения за 14 дней</div>
          <div className="text-xs text-[var(--muted)]">
            всего {fmtNum(sumDaily)} · максимум за день {fmtNum(maxDaily)}
          </div>
        </div>
        {days.length === 0 ? (
          <Empty text="Пока пусто" />
        ) : (
          /*
            У каждого дня есть видимая дорожка, а столбик при любом ненулевом
            значении не мельче 6px: два сообщения при максимуме в двести — это
            один процент высоты, то есть визуальный ноль.
          */
          <div className="flex h-40 items-stretch gap-1.5">
            {days.map((d) => {
              const pct = (d.value / maxDaily) * 100
              return (
                <div key={d.day} className="group flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="h-4 text-center text-[10px] font-bold tabular-nums text-[var(--text)] opacity-0 transition group-hover:opacity-100">
                    {d.value}
                  </div>
                  <div
                    className="flex flex-1 items-end overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel-2)]"
                    title={d.day + ': ' + fmtNum(d.value)}
                  >
                    <div
                      className="w-full rounded-md transition-all"
                      style={{
                        height: pct + '%',
                        minHeight: d.value > 0 ? 6 : 0,
                        background: 'linear-gradient(180deg, var(--accent), var(--accent-2))',
                      }}
                    />
                  </div>
                  <div className="text-center text-[10px] text-[var(--muted)]">{d.day.slice(8)}</div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <div className="mb-3 text-sm font-bold text-[var(--text)]">Самые активные чаты за неделю</div>
        {data.top_chats.length === 0 ? (
          <Empty text="Нет активности" />
        ) : (
          <div className="flex flex-col">
            {data.top_chats.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 border-b border-[var(--border)] py-2 text-sm last:border-0"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[var(--text)]">{c.title || c.id}</span>
                  <Chip>{c.type}</Chip>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--text)]">{fmtNum(Number(c.messages))}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ── вкладка: люди ─────────────────────────── */

function UsersTab() {
  const toast = useStore((s) => s.toast)
  const me = useStore((s) => s.account?.uid)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminUser[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  // Поиск и перелистывание идут через одну загрузку: новый запрос всегда
  // сбрасывает страницу, иначе поиск со третьей страницы даёт пустоту.
  const load = useCallback(
    async (opts?: { query?: string; page?: number }) => {
      const nextQuery = opts?.query ?? q
      const nextPage = opts?.page ?? 0
      setLoading(true)
      setRows((await adminListUsers(nextQuery, ADMIN_PAGE_SIZE, nextPage * ADMIN_PAGE_SIZE)) ?? [])
      setPage(nextPage)
      setLoading(false)
    },
    [q],
  )

  useEffect(() => {
    void load({ query: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const act = async (uid: string, label: string, run: () => Promise<unknown>) => {
    setBusy(uid)
    const ok = await run()
    setBusy(null)
    if (ok === null || ok === false) {
      toast('Не получилось: ' + label, '⚠️')
      return
    }
    toast(label, '✅')
    if (uid === me) invalidatePerks()
    // После действия остаёмся на той же странице.
    await load({ page })
  }

  const ban = (u: AdminUser) => {
    const raw = window.prompt('На сколько дней забанить? Пусто = навсегда', '7')
    if (raw === null) return
    const days = raw.trim() === '' ? null : Number(raw.trim())
    if (days !== null && (!Number.isFinite(days) || days <= 0)) {
      toast('Нужно число дней', '⚠️')
      return
    }
    const reason = window.prompt('Причина (увидит только администрация)', '') ?? ''
    void act(u.uid, 'Бан выдан', () => adminBanUser(u.uid, days, reason))
  }

  const setBots = (u: AdminUser) => {
    const raw = window.prompt('Лимит ботов', String(u.max_bots ?? 0))
    if (raw === null) return
    const value = Number(raw.trim())
    if (!Number.isFinite(value) || value < 0) {
      toast('Нужно число', '⚠️')
      return
    }
    void act(u.uid, 'Лимит ботов обновлён', () => adminSetMaxBots(u.uid, value))
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={q} onChange={setQ} onSubmit={() => void load()} placeholder="Имя, @юзернейм, uid или номер…" />
      {loading && rows.length === 0 ? (
        <Empty text="Загружаем…" />
      ) : rows.length === 0 ? (
        <Empty text={page > 0 ? 'Дальше пусто — вернись назад' : 'Никого не нашлось'} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((u) => {
            const banned = isBanned(u)
            return (
              <Panel key={u.uid} className={cx('flex flex-col gap-2', banned && '!border-rose-500/40')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-bold text-[var(--text)]">
                        {u.name || u.username || u.uid.slice(0, 8)}
                      </span>
                      {u.username && <span className="text-xs text-[var(--muted)]">@{u.username}</span>}
                      {u.is_admin && <Chip tone="warn">админ</Chip>}
                      {u.verified && <Chip tone="good">вериф</Chip>}
                      {u.premium && <Chip tone="good">premium</Chip>}
                      {u.is_bot && <Chip>бот</Chip>}
                      {banned && <Chip tone="bad">бан</Chip>}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {fmtNum(u.messages)} сообщ. · был {fmtDate(u.last_seen)} · с {fmtDate(u.created_at)}
                      {u.num_id != null && ' · #' + u.num_id}
                    </div>
                    {banned && u.ban_reason && (
                      <div className="mt-1 text-xs text-rose-400">Причина: {u.ban_reason}</div>
                    )}
                    {banned && (
                      <div className="text-xs text-rose-400">
                        До:{' '}
                        {u.banned_until && new Date(u.banned_until).getFullYear() > 9000
                          ? 'навсегда'
                          : fmtDate(u.banned_until)}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-[var(--muted)]">боты: {u.max_bots}</div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Btn
                    disabled={busy === u.uid}
                    onClick={() =>
                      void act(u.uid, u.verified ? 'Галочка снята' : 'Галочка выдана', () =>
                        adminSetVerified(u.uid, !u.verified),
                      )
                    }
                  >
                    {u.verified ? 'Снять галочку' : 'Верифицировать'}
                  </Btn>
                  <Btn
                    disabled={busy === u.uid}
                    onClick={() =>
                      void act(u.uid, 'Premium обновлён', () => adminSetPerk(u.uid, 'premium', !u.premium))
                    }
                  >
                    {u.premium ? 'Снять premium' : 'Дать premium'}
                  </Btn>
                  <Btn
                    disabled={busy === u.uid}
                    onClick={() =>
                      void act(u.uid, 'Права на ботов обновлены', () =>
                        adminSetPerk(u.uid, 'can_create_bots', !u.can_create_bots),
                      )
                    }
                  >
                    {u.can_create_bots ? 'Запретить ботов' : 'Разрешить ботов'}
                  </Btn>
                  <Btn disabled={busy === u.uid} onClick={() => setBots(u)}>
                    Лимит ботов…
                  </Btn>
                  {u.uid !== me && (
                    <Btn
                      disabled={busy === u.uid}
                      onClick={() =>
                        void act(u.uid, 'Права админа обновлены', () =>
                          adminSetPerk(u.uid, 'is_admin', !u.is_admin),
                        )
                      }
                    >
                      {u.is_admin ? 'Снять админа' : 'Сделать админом'}
                    </Btn>
                  )}
                  {u.uid !== me &&
                    (banned ? (
                      <Btn
                        tone="primary"
                        disabled={busy === u.uid}
                        onClick={() => void act(u.uid, 'Бан снят', () => adminUnbanUser(u.uid))}
                      >
                        Снять бан
                      </Btn>
                    ) : (
                      <Btn tone="danger" disabled={busy === u.uid} onClick={() => ban(u)}>
                        Забанить…
                      </Btn>
                    ))}
                </div>
              </Panel>
            )
          })}
        </div>
      )}
      <Pager page={page} count={rows.length} loading={loading} onPage={(next) => void load({ page: next })} />
    </div>
  )
}

/* ── вкладка: чаты ─────────────────────────── */

function ChatsTab({ onInspect }: { onInspect: (chatId: string) => void }) {
  const toast = useStore((s) => s.toast)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminChat[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(
    async (opts?: { query?: string; page?: number }) => {
      const nextQuery = opts?.query ?? q
      const nextPage = opts?.page ?? 0
      setLoading(true)
      setRows((await adminListChats(nextQuery, ADMIN_PAGE_SIZE, nextPage * ADMIN_PAGE_SIZE)) ?? [])
      setPage(nextPage)
      setLoading(false)
    },
    [q],
  )

  useEffect(() => {
    void load({ query: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remove = async (c: AdminChat) => {
    const title = c.title || c.id
    if (!window.confirm('Удалить «' + title + '» вместе со всеми сообщениями? Действие необратимо.')) return
    if (window.prompt('Для подтверждения напиши УДАЛИТЬ') !== 'УДАЛИТЬ') return
    setBusy(c.id)
    const ok = await adminDeleteChat(c.id)
    setBusy(null)
    toast(ok ? 'Чат удалён' : 'Не удалось удалить чат', ok ? '🗑️' : '⚠️')
    await load({ page })
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={q} onChange={setQ} onSubmit={() => void load()} placeholder="Название, @адрес или id чата…" />
      {loading && rows.length === 0 ? (
        <Empty text="Загружаем…" />
      ) : rows.length === 0 ? (
        <Empty text={page > 0 ? 'Дальше пусто — вернись назад' : 'Чатов не нашлось'} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((c) => (
            <Panel key={c.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-bold text-[var(--text)]">{c.title || c.id}</span>
                    <Chip>{c.type}</Chip>
                    {c.is_private && <Chip tone="warn">приватный</Chip>}
                    {c.verified && <Chip tone="good">вериф</Chip>}
                    {c.member_count !== c.members_real && <Chip tone="bad">счётчик рассогласован</Chip>}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {fmtNum(c.members_real)} участн. · {fmtNum(c.messages)} сообщ. · активность{' '}
                    {fmtDate(c.last_message_at)}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">id: {c.id}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Btn onClick={() => onInspect(c.id)}>Сообщения чата</Btn>
                <Btn
                  disabled={busy === c.id}
                  onClick={async () => {
                    setBusy(c.id)
                    const ok = await adminSetChatVerified(c.id, !c.verified)
                    setBusy(null)
                    toast(ok ? 'Готово' : 'Не получилось', ok ? '✅' : '⚠️')
                    await load({ page })
                  }}
                >
                  {c.verified ? 'Снять галочку' : 'Верифицировать'}
                </Btn>
                <Btn tone="danger" disabled={busy === c.id} onClick={() => void remove(c)}>
                  Удалить чат…
                </Btn>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Pager page={page} count={rows.length} loading={loading} onPage={(next) => void load({ page: next })} />
    </div>
  )
}

/* ── вкладка: сообщения ──────────────────── */

function MessagesTab({ chatFilter, onClearFilter }: { chatFilter: string | null; onClearFilter: () => void }) {
  const toast = useStore((s) => s.toast)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminMessage[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(
    async (opts?: { query?: string; page?: number }) => {
      const nextQuery = opts?.query ?? q
      const nextPage = opts?.page ?? 0
      setLoading(true)
      setRows(
        (await adminSearchMessages(nextQuery, chatFilter, ADMIN_PAGE_SIZE, nextPage * ADMIN_PAGE_SIZE)) ?? [],
      )
      setPage(nextPage)
      setLoading(false)
    },
    [q, chatFilter],
  )

  // Смена фильтра по чату — это другой набор строк, так что с первой страницы.
  useEffect(() => {
    void load({ page: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatFilter])

  const remove = async (m: AdminMessage, hard: boolean) => {
    if (hard && !window.confirm('Удалить сообщение из базы навсегда?')) return
    setBusy(m.id)
    const ok = await adminDeleteMessage(m.id, hard)
    setBusy(null)
    toast(ok ? 'Готово' : 'Не получилось', ok ? '🗑️' : '⚠️')
    await load({ page })
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={q} onChange={setQ} onSubmit={() => void load()} placeholder="Текст сообщения…" />
      {chatFilter && (
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="truncate">Фильтр по чату: {chatFilter}</span>
          <Btn onClick={onClearFilter}>Сбросить</Btn>
        </div>
      )}
      {loading && rows.length === 0 ? (
        <Empty text="Загружаем…" />
      ) : rows.length === 0 ? (
        <Empty text={page > 0 ? 'Дальше пусто — вернись назад' : 'Ничего не нашлось'} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((m) => (
            <Panel key={m.id} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                <span className="font-bold text-[var(--text)]">{m.sender_name || m.sender_username || '—'}</span>
                <span>в {m.chat_title || m.chat_id}</span>
                <span>· {fmtDate(m.ts)}</span>
                {m.deleted && <Chip tone="bad">удалено</Chip>}
                {m.has_attachment && <Chip>вложение</Chip>}
              </div>
              <div className="whitespace-pre-wrap break-words text-sm text-[var(--text)]">{m.text || '—'}</div>
              <div className="flex flex-wrap gap-1.5">
                {!m.deleted && (
                  <Btn tone="danger" disabled={busy === m.id} onClick={() => void remove(m, false)}>
                    Скрыть
                  </Btn>
                )}
                <Btn tone="danger" disabled={busy === m.id} onClick={() => void remove(m, true)}>
                  Удалить навсегда
                </Btn>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Pager page={page} count={rows.length} loading={loading} onPage={(next) => void load({ page: next })} />
    </div>
  )
}

/* ── вкладка: жалобы ─────────────────────── */

const STATUSES: Array<{ key: ReportStatus | 'all'; label: string }> = [
  { key: 'open', label: 'Открытые' },
  { key: 'resolved', label: 'Решённые' },
  { key: 'dismissed', label: 'Отклонённые' },
  { key: 'all', label: 'Все' },
]

function ReportsTab({ onInspect }: { onInspect: (chatId: string) => void }) {
  const toast = useStore((s) => s.toast)
  const [status, setStatus] = useState<ReportStatus | 'all'>('open')
  const [rows, setRows] = useState<AdminReport[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (next: ReportStatus | 'all', nextPage = 0) => {
    setLoading(true)
    setRows((await adminListReports(next, ADMIN_PAGE_SIZE, nextPage * ADMIN_PAGE_SIZE)) ?? [])
    setPage(nextPage)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(status)
  }, [status, load])

  const resolve = async (r: AdminReport, next: ReportStatus) => {
    const ok = await adminResolveReport(r.id, next)
    toast(ok ? 'Статус обновлён' : 'Не получилось', ok ? '✅' : '⚠️')
    await load(status, page)
  }

  return (
    <div className="flex flex-col gap-3">
      <FilterRow items={STATUSES} value={status} onPick={setStatus} />
      {loading && rows.length === 0 ? (
        <Empty text="Загружаем…" />
      ) : rows.length === 0 ? (
        <Empty text={page > 0 ? 'Дальше пусто — вернись назад' : 'Жалоб нет — тишина в королевстве'} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <Panel key={r.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                <Chip tone={r.status === 'open' ? 'warn' : r.status === 'resolved' ? 'good' : 'muted'}>
                  {r.status}
                </Chip>
                <Chip>{r.target_type}</Chip>
                <span>от {r.reporter_name || r.reporter_username || r.reporter_uid.slice(0, 8)}</span>
                <span>· {fmtDate(r.created_at)}</span>
              </div>
              <div className="text-sm font-semibold text-[var(--text)]">{r.reason}</div>
              {r.note && <div className="whitespace-pre-wrap break-words text-sm text-[var(--muted)]">{r.note}</div>}
              <div className="text-[11px] text-[var(--muted)]">Объект: {r.target_id}</div>
              <div className="flex flex-wrap gap-1.5">
                {r.target_type === 'chat' && <Btn onClick={() => onInspect(r.target_id)}>Открыть сообщения</Btn>}
                {r.status !== 'resolved' && (
                  <Btn tone="primary" onClick={() => void resolve(r, 'resolved')}>
                    Решено
                  </Btn>
                )}
                {r.status !== 'dismissed' && <Btn onClick={() => void resolve(r, 'dismissed')}>Отклонить</Btn>}
                {r.status !== 'open' && <Btn onClick={() => void resolve(r, 'open')}>Вернуть в работу</Btn>}
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Pager page={page} count={rows.length} loading={loading} onPage={(next) => void load(status, next)} />
    </div>
  )
}

/* ── вкладка: журнал действий ─────────────── */

const AUDIT_FILTERS: Array<{ key: AdminAuditAction | 'all'; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'ban_user', label: 'Баны' },
  { key: 'unban_user', label: 'Разбаны' },
  { key: 'set_verified', label: 'Галочки' },
  { key: 'delete_message', label: 'Сообщения' },
  { key: 'delete_chat', label: 'Удалённые чаты' },
  { key: 'resolve_report', label: 'Жалобы' },
  { key: 'set_perk', label: 'Перки' },
]

const AUDIT_ICONS: Record<string, string> = {
  ban_user: '🚫',
  unban_user: '🔓',
  set_verified: '✔️',
  set_chat_verified: '✔️',
  delete_chat: '🗑️',
  delete_message: '✂️',
  resolve_report: '🚩',
  set_perk: '🎁',
  set_max_bots: '🤖',
}

/**
 * Журнал действий администрации — только чтение.
 *
 * Записи ставит сама база внутри каждой мутирующей admin_* RPC, а право
 * на fc_admin_log() у роли authenticated отозвано. Значит, запись нельзя ни
 * подделать, ни пропустить, обойдя UI. Кнопки «удалить запись» здесь нет
 * и быть не должно: журнал, в котором можно стирать строки, не журнал.
 */
function AuditTab() {
  const [action, setAction] = useState<AdminAuditAction | 'all'>('all')
  const [target, setTarget] = useState('')
  const [rows, setRows] = useState<AdminAuditEntry[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)

  const load = useCallback(
    async (opts?: { action?: AdminAuditAction | 'all'; target?: string; page?: number }) => {
      const nextAction = opts?.action ?? action
      const nextTarget = opts?.target ?? target
      const nextPage = opts?.page ?? 0
      setLoading(true)
      setRows(
        (await adminListAudit(nextAction, nextTarget.trim() || null, ADMIN_PAGE_SIZE, nextPage * ADMIN_PAGE_SIZE)) ??
          [],
      )
      setPage(nextPage)
      setLoading(false)
    },
    [action, target],
  )

  useEffect(() => {
    void load({ action, page: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-[var(--muted)]">
        Кто из админов что сделал. Записи ставит база, правка и удаление невозможны.
      </div>
      <FilterRow items={AUDIT_FILTERS} value={action} onPick={setAction} />
      <SearchBox
        value={target}
        onChange={setTarget}
        onSubmit={() => void load({ page: 0 })}
        placeholder="id объекта: uid, id чата или сообщения…"
      />
      {loading && rows.length === 0 ? (
        <Empty text="Загружаем…" />
      ) : rows.length === 0 ? (
        <Empty text={page > 0 ? 'Дальше пусто — вернись назад' : 'Записей нет — админы ничего не трогали'} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((e) => {
            const detail = e.detail ?? {}
            const hasDetail = Object.keys(detail).length > 0
            return (
              <Panel key={e.id} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                  <span className="text-base leading-none">{AUDIT_ICONS[e.action] ?? '📝'}</span>
                  <span className="font-bold text-[var(--text)]">
                    {e.actor_name || e.actor_username || (e.actor_uid ? e.actor_uid.slice(0, 8) : '—')}
                  </span>
                  <span className="text-[var(--text)]">{auditLabel(e)}</span>
                  <Chip>{e.target_type}</Chip>
                  <span>· {fmtDate(e.created_at)}</span>
                </div>
                {e.target_id && (
                  <div className="break-all text-[11px] text-[var(--muted)]">Объект: {e.target_id}</div>
                )}
                {hasDetail && (
                  <div>
                    <Btn onClick={() => setOpen(open === e.id ? null : e.id)}>
                      {open === e.id ? 'Скрыть подробности' : 'Подробности'}
                    </Btn>
                    {open === e.id && (
                      <pre className="fancy-scroll mt-1.5 max-h-48 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-2 text-[11px] leading-relaxed text-[var(--text)]">
                        {JSON.stringify(detail, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      )}
      <Pager page={page} count={rows.length} loading={loading} onPage={(next) => void load({ page: next })} />
    </div>
  )
}

/* ── страница ──────────────────────────── */

export function AdminConsole({ onClose }: { onClose: () => void }) {
  const perks = usePerks()
  const account = useStore((s) => s.account)
  const [tab, setTab] = useState<Tab>('overview')
  const [chatFilter, setChatFilter] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const inspectChat = (chatId: string) => {
    setChatFilter(chatId)
    setTab('messages')
  }

  if (!account || !perks.is_admin) {
    return (
      <div
        className="grid h-full place-items-center p-6"
        style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}
      >
        <Panel className="max-w-sm text-center">
          <div className="mb-2 text-3xl">🔒</div>
          <div className="mb-1 font-bold text-[var(--text)]">Страница только для администрации</div>
          <div className="mb-3 text-sm text-[var(--muted)]">
            У этого аккаунта нет прав админа. Данные защищены также на стороне базы.
          </div>
          <Btn tone="primary" onClick={onClose}>
            Вернуться в чаты
          </Btn>
        </Panel>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: 'linear-gradient(160deg, var(--bg-grad-1), var(--bg-grad-2))' }}
    >
      <header className="glass flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--panel-hover)]"
        >
          ← В чаты
        </button>
        <div className="min-w-0">
          <div className="truncate text-base font-black text-[var(--text)]">Панель управления</div>
          <div className="truncate text-xs text-[var(--muted)]">
            {account.name || account.username} · полный доступ
          </div>
        </div>
      </header>

      <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cx(
              'whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-semibold transition',
              tab === t.key
                ? 'accent-gradient border-transparent text-white'
                : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:bg-[var(--panel-hover)]',
            )}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="fancy-scroll min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-4xl">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'chats' && <ChatsTab onInspect={inspectChat} />}
          {tab === 'messages' && (
            <MessagesTab chatFilter={chatFilter} onClearFilter={() => setChatFilter(null)} />
          )}
          {tab === 'reports' && <ReportsTab onInspect={inspectChat} />}
          {tab === 'audit' && <AuditTab />}
        </div>
      </main>
    </div>
  )
}

export default AdminConsole
