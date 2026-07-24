// Slash commands + text emoticons — the "fun" layer of the composer.
// Everything here is pure text transformation, so it works identically on the
// local demo backend and on Supabase.

export type EffectKind = 'confetti' | 'hearts' | 'stars'

export interface SlashSpec {
  name: string
  hint: string
  desc: string
  emoji: string
}

/** Commands surfaced in the autocomplete popover (typing "/"). */
export const SLASH_COMMANDS: SlashSpec[] = [
  { name: 'me', hint: '/me <действие>', desc: 'Сообщение-действие от третьего лица', emoji: '🎭' },
  { name: 'shrug', hint: '/shrug', desc: 'Добавить ¯\\_(ツ)_/¯', emoji: '🤷' },
  { name: 'party', hint: '/party', desc: 'Конфетти на весь экран', emoji: '🎉' },
  { name: 'rain', hint: '/rain', desc: 'Дождь из сердечек', emoji: '💗' },
  { name: 'roll', hint: '/roll [грани]', desc: 'Бросить кубик', emoji: '🎲' },
  { name: 'flip', hint: '/flip', desc: 'Подбросить монетку', emoji: '🪙' },
  { name: '8ball', hint: '/8ball <вопрос>', desc: 'Магический шар отвечает', emoji: '🎱' },
  { name: 'love', hint: '/love [@кто]', desc: 'Проверить совместимость', emoji: '❤️' },
  { name: 'hug', hint: '/hug [@кто]', desc: 'Обнять', emoji: '🫂' },
  { name: 'gift', hint: '/gift', desc: 'Отправить подарок-стикер', emoji: '🎁' },
  { name: 'nya', hint: '/nya', desc: 'Ня~', emoji: '🐾' },
  { name: 'lenny', hint: '/lenny', desc: '( ͡° ͜ʖ ͡°)', emoji: '😏' },
  { name: 'table', hint: '/table', desc: '(╯°□°)╯︵ ┻━┻', emoji: '💢' },
  { name: 'unflip', hint: '/unflip', desc: '┬─┬ ノ( ゜-゜ノ)', emoji: '🧘' },
]

const BALL_ANSWERS = [
  'Бесспорно 💯', 'Даже не сомневайся ✨', 'Определённо да 💗', 'Знаки говорят «да» 🌸',
  'Скорее да, чем нет 🙂', 'Пока не ясно, спроси позже 🌙', 'Лучше не рассказывать сейчас 🤫',
  'Сконцентрируйся и спроси ещё раз 🔮', 'Не рассчитывай на это 🙈', 'Мой ответ — нет 🚫',
  'Очень сомневаюсь 😳', 'Звёзды против 🌠',
]

function rnd(n: number) {
  return Math.floor(Math.random() * n)
}
function pick<T>(arr: T[]): T {
  return arr[rnd(arr.length)]
}

export interface CommandOutput {
  text?: string
  sticker?: string
  effect?: EffectKind
  /** local-only feedback (not sent), e.g. an easter-egg toast */
  toast?: { text: string; emoji?: string }
}

/**
 * Run a slash command. Returns null when the text is not a recognized command
 * (so the composer just sends it verbatim).
 */
export function runCommand(raw: string, selfName: string): CommandOutput | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return null
  const [word, ...rest] = trimmed.slice(1).split(/\s+/)
  const arg = rest.join(' ').trim()
  const cmd = word.toLowerCase()

  switch (cmd) {
    case 'me':
      if (!arg) return null
      return { text: `*${selfName} ${arg}*` }
    case 'shrug':
      return { text: `${arg} ¯\\_(ツ)_/¯`.trim() }
    case 'party':
      return { text: arg || '🎉 вечеринка!', effect: 'confetti' }
    case 'rain':
      return { text: arg || '💗', effect: 'hearts' }
    case 'roll': {
      const faces = Math.max(2, Math.min(1000, parseInt(arg, 10) || 6))
      return { text: `🎲 выпало ${1 + rnd(faces)} (из ${faces})` }
    }
    case 'flip':
      return { text: `🪙 ${Math.random() < 0.5 ? 'Орёл' : 'Решка'}` }
    case '8ball':
    case 'ball':
      if (!arg) return { text: '🎱 Задай вопрос: /8ball любит ли меня senpai?' }
      return { text: `🎱 «${arg}» — ${pick(BALL_ANSWERS)}` }
    case 'love': {
      const pct = rnd(101)
      const heart = pct > 80 ? '💗' : pct > 50 ? '💓' : pct > 20 ? '💔' : '🥀'
      return { text: `${heart} Совместимость${arg ? ` с ${arg}` : ''}: ${pct}%`, effect: pct > 80 ? 'hearts' : undefined }
    }
    case 'hug':
      return { text: `🫂 крепко обнимает${arg ? ` ${arg}` : ' тебя'}` }
    case 'nya':
      return { text: 'ня~ 🐾', effect: 'stars' }
    case 'lenny':
      return { text: `${arg} ( ͡° ͜ʖ ͡°)`.trim() }
    case 'table':
      return { text: '(╯°□°)╯︵ ┻━┻' }
    case 'unflip':
      return { text: '┬─┬ ノ( ゜-゜ノ)' }
    default:
      return null
  }
}

// ── text emoticons ────────────────────────────────────────────────
// Ordered longest-first so ":'(" wins over ":(", etc.
const EMOTICONS: [string, string][] = [
  ["<3", '❤️'], ['</3', '💔'], [":')", '🥲'], [":'(", '😢'],
  ['xD', '😆'], ['XD', '😆'], [':D', '😄'], [':d', '😄'],
  [':P', '😛'], [':p', '😛'], [';)', '😉'], [':)', '🙂'], ['=)', '🙂'],
  [':(', '🙁'], [':o', '😮'], [':O', '😮'], [':3', '😺'], ['^^', '😊'],
  ['uwu', '🥺'], ['UwU', '🥺'], ['owo', '😳'], ['OwO', '😳'], [':*', '😘'],
]

/**
 * Replace standalone text emoticons with emoji. Only matches when the token is
 * bounded by whitespace / string ends, so URLs and code stay intact.
 */
export function applyEmoticons(text: string): string {
  let out = text
  for (const [from, to] of EMOTICONS) {
    // build a boundary-aware matcher without regex-escaping headaches
    let idx = 0
    let result = ''
    while (idx < out.length) {
      const at = out.indexOf(from, idx)
      if (at === -1) {
        result += out.slice(idx)
        break
      }
      const before = out[at - 1]
      const after = out[at + from.length]
      const boundedBefore = at === 0 || /\s/.test(before)
      const boundedAfter = after === undefined || /\s/.test(after)
      result += out.slice(idx, at)
      if (boundedBefore && boundedAfter) {
        result += to
      } else {
        result += from
      }
      idx = at + from.length
    }
    out = result
  }
  return out
}
