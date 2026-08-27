/*
  Отдельная страница админ-управления (маршрут #admin).

  Доступ: клиент скрывает страницу по usePerks().is_admin, но это только UI.
  Настоящая граница — в базе: каждая admin_* RPC первым делом проверяет
  fc_is_admin() и выдана только роли authenticated. Подмена флага в браузере
  не даёт ни одного байта данных.
*/
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { usePerks, invalidatePerks } from '../../lib/perks'
import {
  adminBanUser,
  adminDeleteChat,
  adminDeleteMessage,
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
  fmtDate,
  fmtNum,
  isBanned,
  type AdminChat,
  type AdminMessage,
  type AdminOverview,
  type AdminReport,
  type AdminUser,
  type ReportStatus,
} from '../../lib/admin'

type Tab = 'overview' | 'users' | 'chats' | 'messages' | 'reports'

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'overview', label: 'Обзор', icon: '📊' },
  { key: 'users', label: 'Люди', icon: '👥' },
  { key: 'chats', label: 'Чаты', icon: '💬' },
  { key: 'messages', label: 'Сообщения', icon: '🔎' },
  { key: 'reports', label: 'Жалобы', icon: '🚩' },
]

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ── мелкие примитивы ──────────────────────────────────────────────────── */

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4', className)}>
      {children}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel className="flex flex-col gap-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="text-2xl font-black">{value}</div>
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
    ghost: 'border-[var(--line)] hover:bg-[var(--hover)]',
    primary: 'border-transparent bg-[var(--accent)] text-white hover:opacity-90',
    danger: 'border-red-500/40 text-red-400 hover:bg-red-500/10',
  }
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40',
        tones[tone],
      )}
    >
      {children}
    </button>
  )
}

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'good' | 'bad' | 'warn' }) {
  const tones = {
    muted: 'bg-[var(--hover)] text-[var(--muted)]',
    good: 'bg-emerald-500/15 text-emerald-400',
    bad: 'bg-red-500/15 text-red-400',
    warn: 'bg-amber-500/15 text-amber-400',
  }
  return <span className={cx('rounded-lg px-1.5 py-0.5 text-[11px] font-bold', tones[tone])}>{children}</span>
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
        className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
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

/* ── вкладка: обзор ──────────────────────────────────────────────────── */

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

  const maxDaily = useMemo(
    () => Math.max(1, ...(data?.daily ?? []).map((d) => Number(d.messages) || 0)),
    [data],
  )

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
        <div className="mb-3 text-sm font-bold">Сообщения за 14 дней</div>
        {data.daily.length === 0 ? (
          <Empty text="Пока пусто" />
        ) : (
          <div className="flex h-32 items-end gap-1">
            {data.daily.map((d) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center justify-end gap-1">
                <div
                  className="w-full rounded-t-md bg-[var(--accent)]/70 transition group-hover:bg-[var(--accent)]"
                  style={{ height: Math.max(2, (Number(d.messages) / maxDaily) * 100) + '%' }}
                  title={d.day + ': ' + fmtNum(Number(d.messages))}
                />
                <div className="text-[10px] text-[var(--muted)]">{d.day.slice(8)}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <div className="mb-3 text-sm font-bold">Самые активные чаты за неделю</div>
        {data.top_chats.length === 0 ? (
          <Empty text="Нет активности" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.top_chats.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {c.title || c.id} <Chip>{c.type}</Chip>
                </span>
                <span className="font-bold tabular-nums">{fmtNum(Number(c.messages))}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ── вкладка: люди ───────────────────────────────────────────────────── */

function UsersTab() {
  const toast = useStore((s) => s.toast)
  const me = useStore((s) => s.account?.uid)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(
    async (query?: string) => {
      setLoading(true)
      setRows((await adminListUsers(query ?? q)) ?? [])
      setLoading(false)
    },
    [q],
  )

  useEffect(() => {
    void load('')
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
    await load()
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
        <Empty text="Никого не нашлось" />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((u) => {
            const banned = isBanned(u)
            return (
              <Panel key={u.uid} className={cx('flex flex-col gap-2', banned && 'border-red-500/40')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-bold">{u.name || u.username || u.uid.slice(0, 8)}</span>
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
                      <div className="mt-1 text-xs text-red-400">Причина: {u.ban_reason}</div>
                    )}
                    {banned && (
                      <div className="text-xs text-red-400">
                        До:{' '}
                        {u.banned_until && new Date(u.banned_until).getFullYear() > 9000
                          ? 'навсегда'
                          : fmtDate(u.banned_until)}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-[var(--muted)]">
                    боты: {u.max_bots}
                  </div>
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
    </div>
  )
}

/* ── вкладка: чаты ───────────────────────────────────────────────────── */

function ChatsTab({ onInspect }: { onInspect: (chatId: string) => void }) {
  const toast = useStore((s) => s.toast)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminChat[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(
    async (query?: string) => {
      setLoading(true)
      setRows((await adminListChats(query ?? q)) ?? [])
      setLoading(false)
    },
    [q],
  )

  useEffect(() => {
    void load('')
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
    await load()
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={q} onChange={setQ} onSubmit={() => void load()} placeholder="Название, @адрес или id чата…" />
      {loading && rows.length === 0 ? (
        <Empty text="Загружаем…" />
      ) : rows.length === 0 ? (
        <Empty text="Чатов не нашлось" />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((c) => (
            <Panel key={c.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-bold">{c.title || c.id}</span>
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
                    await load()
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
    </div>
  )
}

/* ── вкладка: сообщения ────────────────────────────────────────────────── */

function MessagesTab({ chatFilter, onClearFilter }: { chatFilter: string | null; onClearFilter: () => void }) {
  const toast = useStore((s) => s.toast)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(
    async (query?: string) => {
      setLoading(true)
      setRows((await adminSearchMessages(query ?? q, chatFilter)) ?? [])
      setLoading(false)
    },
    [q, chatFilter],
  )

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatFilter])

  const remove = async (m: AdminMessage, hard: boolean) => {
    if (hard && !window.confirm('Удалить сообщение из базы навсегда?')) return
    setBusy(m.id)
    const ok = await adminDeleteMessage(m.id, hard)
    setBusy(null)
    toast(ok ? 'Готово' : 'Не получилось', ok ? '🗑️' : '⚠️')
    await load()
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={q} onChange={setQ} onSubmit={() => void load()} placeholder="Текст сообщения…" />
      {chatFilter && (
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span>Фильтр по чату: {chatFilter}</span>
          <Btn onClick={onClearFilter}>Сбросить</Btn>
        </div>
      )}
      {loading && rows.length === 0 ? (
        <Empty text="Загружаем…" />
      ) : rows.length === 0 ? (
        <Empty text="Ничего не нашлось" />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((m) => (
            <Panel key={m.id} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                <span className="font-bold text-[var(--fg)]">
                  {m.sender_name || m.sender_username || '—'}
                </span>
                <span>в {m.chat_title || m.chat_id}</span>
                <span>· {fmtDate(m.ts)}</span>
                {m.deleted && <Chip tone="bad">удалено</Chip>}
                {m.has_attachment && <Chip>вложение</Chip>}
              </div>
              <div className="whitespace-pre-wrap break-words text-sm">{m.text || '—'}</div>
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
    </div>
  )
}

/* ── вкладка: жалобы ─────────────────────────────────────────────────── */

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
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (next: ReportStatus | 'all') => {
    setLoading(true)
    setRows((await adminListReports(next)) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(status)
  }, [status, load])

  const resolve = async (r: AdminReport, next: ReportStatus) => {
    const ok = await adminResolveReport(r.id, next)
    toast(ok ? 'Статус обновлён' : 'Не получилось', ok ? '✅' : '⚠️')
    await load(status)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatus(s.key)}
            className={cx(
              'rounded-xl border px-3 py-1.5 text-xs font-semibold transition',
              status === s.key
                ? 'border-transparent bg-[var(--accent)] text-white'
                : 'border-[var(--line)] hover:bg-[var(--hover)]',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      {loading && rows.length === 0 ? (
        <Empty text="Загружаем…" />
      ) : rows.length === 0 ? (
        <Empty text="Жалоб нет — тишина в королевстве" />
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
              <div className="text-sm font-semibold">{r.reason}</div>
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
    </div>
  )
}

/* ── страница ───────────────────────────────────────────────────────── */

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
      <div className="grid h-full place-items-center p-6">
        <Panel className="max-w-sm text-center">
          <div className="mb-2 text-3xl">🔒</div>
          <div className="mb-1 font-bold">Страница только для администрации</div>
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
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)]/80 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--hover)]"
        >
          ← В чаты
        </button>
        <div className="min-w-0">
          <div className="truncate text-base font-black">Панель управления</div>
          <div className="truncate text-xs text-[var(--muted)]">
            {account.name || account.username} · полный доступ
          </div>
        </div>
      </header>

      <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--line)] px-4 py-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cx(
              'whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-semibold transition',
              tab === t.key
                ? 'border-transparent bg-[var(--accent)] text-white'
                : 'border-[var(--line)] hover:bg-[var(--hover)]',
            )}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-4xl">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'chats' && <ChatsTab onInspect={inspectChat} />}
          {tab === 'messages' && (
            <MessagesTab chatFilter={chatFilter} onClearFilter={() => setChatFilter(null)} />
          )}
          {tab === 'reports' && <ReportsTab onInspect={inspectChat} />}
        </div>
      </main>
    </div>
  )
}

export default AdminConsole
