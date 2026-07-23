import type { Account, Chat, Directory, Message } from '../types'
import { defaultSettings } from './defaults'

const now = Date.now()
const min = 60_000

function acc(
  numId: number,
  uid: string,
  username: string,
  name: string,
  emoji: string,
  color: string,
  bio: string,
  isBot = false,
  verified = false,
): Account {
  return {
    numId,
    uid,
    username,
    name,
    email: `${username}@femboychat.demo`,
    bio,
    emoji,
    color,
    status: '',
    verified,
    isBot,
    createdAt: now - numId * 86_400_000,
    lastSeen: now - (numId % 5) * 7 * min,
    settings: defaultSettings(),
  }
}

// People + bots have real "accounts" so DMs resolve their profile.
export const seedAccounts: Account[] = [
  acc(1, 'seed-mia', 'toffee', 'Toffee', '🧸', '#ff7ab8', 'сладкий как ириска 🧸 люблю уютные вечера', false, true),
  acc(2, 'seed-kira', 'sezotai', 'Sezotai', '🦊', '#b388ff', 'бантики > всё остальное 🎀'),
  acc(3, 'seed-lera', 'cardo', 'cardo', '🎧', '#ffb26b', 'кодю под lo-fi и рисую'),
  acc(4, 'seed-sonya', 'milo', 'Milo', '🌙', '#6ad3ff', 'ночная сова 🌙 играю по ночам'),
  acc(5, 'seed-alex', 'pixel', 'Pixel', '🧦', '#5ad1c4', 'коллекционирую полосатые носочки'),
  acc(6, 'bot-fem', 'fembot', 'FemBot', '🤖', '#7cc4ff', 'умный помощник FemboyChat. напиши /help', true, true),
  acc(7, 'bot-sticker', 'stickerbot', 'StickerBot', '🖼️', '#f2a2e8', 'пришлю милые стикеры. /sticker', true),
  acc(8, 'bot-quote', 'quotebot', 'QuoteBot', '💬', '#8ee6a0', 'вдохновляющие цитаты каждый день', true),
]

// Groups & channels become chats directly.
export const seedChats: Chat[] = [
  {
    id: 'chan-news',
    type: 'channel',
    title: 'FemboyChat News',
    username: 'news',
    emoji: '📣',
    color: '#ff7ab8',
    description: 'Официальный канал новостей и обновлений FemboyChat 💖',
    memberUids: ['seed-mia', 'seed-kira', 'seed-lera', 'seed-sonya', 'seed-alex'],
    adminUids: ['seed-mia'],
    ownerUid: 'seed-mia',
    verified: true,
    memberCount: 1287,
    createdAt: now - 30 * 86_400_000,
  },
  {
    id: 'chan-wall',
    type: 'channel',
    title: 'Пастельные обои',
    username: 'wallpapers',
    emoji: '🖼️',
    color: '#b388ff',
    description: 'Нежные обои для телефона и десктопа каждый день',
    memberUids: ['seed-kira', 'seed-sonya'],
    adminUids: ['seed-kira'],
    ownerUid: 'seed-kira',
    memberCount: 642,
    createdAt: now - 20 * 86_400_000,
  },
  {
    id: 'chan-music',
    type: 'channel',
    title: 'Мурр-музыка',
    username: 'music',
    emoji: '🎧',
    color: '#6ad3ff',
    description: 'lo-fi, синти и всё, подо что приятно кодить',
    memberUids: ['seed-sonya', 'seed-lera'],
    adminUids: ['seed-sonya'],
    ownerUid: 'seed-sonya',
    memberCount: 918,
    createdAt: now - 18 * 86_400_000,
  },
  {
    id: 'grp-lounge',
    type: 'group',
    title: 'Femboy Общение 💬',
    username: 'lounge',
    emoji: '💬',
    color: '#ff5fa2',
    description: 'Уютный чат для общения обо всём. Будьте добры друг к другу 🫶',
    memberUids: ['seed-mia', 'seed-kira', 'seed-lera', 'seed-sonya', 'seed-alex'],
    adminUids: ['seed-mia', 'seed-kira'],
    ownerUid: 'seed-mia',
    memberCount: 342,
    createdAt: now - 25 * 86_400_000,
  },
  {
    id: 'grp-dev',
    type: 'group',
    title: 'Программисточки 💻',
    username: 'devsocks',
    emoji: '💻',
    color: '#5ad1c4',
    description: 'Обсуждаем код, полосатые носки и pet-проекты',
    memberUids: ['seed-lera', 'seed-alex', 'seed-sonya'],
    adminUids: ['seed-lera'],
    ownerUid: 'seed-lera',
    memberCount: 156,
    createdAt: now - 12 * 86_400_000,
  },
  {
    id: 'grp-art',
    type: 'group',
    title: 'Арт и рисование 🎨',
    username: 'art',
    emoji: '🎨',
    color: '#ffb26b',
    description: 'Делимся артами, скетчами и вдохновением',
    memberUids: ['seed-lera', 'seed-kira'],
    adminUids: ['seed-lera'],
    ownerUid: 'seed-lera',
    memberCount: 203,
    createdAt: now - 9 * 86_400_000,
  },
]

// Directory = everything searchable: people, bots, channels, groups.
export const seedDirectory: Directory[] = [
  ...seedAccounts.map<Directory>((a) => ({
    uid: a.uid,
    kind: a.isBot ? 'bot' : 'user',
    numId: a.numId,
    username: a.username,
    name: a.name,
    emoji: a.emoji,
    color: a.color,
    bio: a.bio,
    verified: a.verified,
    online: !a.isBot && a.numId % 3 === 0,
  })),
  ...seedChats.map<Directory>((c) => ({
    uid: c.id,
    kind: c.type === 'channel' ? 'channel' : 'group',
    numId: 0,
    username: c.username ?? '',
    name: c.title,
    emoji: c.emoji,
    color: c.color,
    bio: c.description ?? '',
    verified: !!c.verified,
    members: c.memberCount,
  })),
]

function msg(
  id: string,
  chatId: string,
  senderUid: string,
  text: string,
  minsAgo: number,
): Message {
  return {
    id,
    chatId,
    senderUid,
    text,
    ts: now - minsAgo * min,
    reactions: [],
    readByUids: [],
  }
}

export const seedMessages: Record<string, Message[]> = {
  'chan-news': [
    msg('m-n1', 'chan-news', 'seed-mia', '🎉 Добро пожаловать в FemboyChat! Тёплый мессенджер для своих.', 600),
    msg('m-n2', 'chan-news', 'seed-mia', 'Новое: **тёмная тема «Catgirl Night»** и акцентные цвета в настройках ✨', 320),
    msg('m-n3', 'chan-news', 'seed-mia', 'Скоро: голосовые сообщения и папки чатов. Оставайтесь на связи 🎀', 60),
  ],
  'grp-lounge': [
    msg('m-l1', 'grp-lounge', 'seed-kira', 'привет всем 🎀 как настроение?', 240),
    msg('m-l2', 'grp-lounge', 'seed-alex', 'о, тут уютно 🧦 привет!', 232),
    msg('m-l3', 'grp-lounge', 'seed-sonya', 'сижу кодю ночью как обычно 🌙', 210),
    msg('m-l4', 'grp-lounge', 'seed-lera', 'кто-нибудь рисует? хочу показать скетч 🦊🎨', 120),
  ],
  'grp-dev': [
    msg('m-d1', 'grp-dev', 'seed-lera', 'кто на чём пишет фронт? я на React 💻', 300),
    msg('m-d2', 'grp-dev', 'seed-alex', 'ваниль + немного магии ✨', 290),
    msg('m-d3', 'grp-dev', 'seed-sonya', 'TypeScript наше всё, меняю жизнь на типы', 120),
  ],
  'chan-wall': [
    msg('m-w1', 'chan-wall', 'seed-kira', 'Обои дня: нежный градиент розовый→голубой 🌸→🩵', 400),
  ],
  'chan-music': [
    msg('m-mu1', 'chan-music', 'seed-sonya', 'Плейлист на ночь: lo-fi + дождь 🌧️🎧', 180),
  ],
}

/** Canned bot replies for the local/demo backend. */
export function botReply(botUid: string, text: string): string {
  const t = text.trim().toLowerCase()
  if (botUid === 'bot-fem') {
    if (t.startsWith('/start')) return 'Привет! Я FemBot 🤖 Напиши /help, чтобы узнать что я умею.'
    if (t.startsWith('/help'))
      return 'Команды: /start, /help, /joke, /theme, /id. А ещё я просто поддержу беседу 🫶'
    if (t.startsWith('/joke')) return 'Почему программисточки любят тёмную тему? Потому что свет притягивает баги 🐛✨'
    if (t.startsWith('/theme')) return 'Загляни в Настройки → Оформление: там есть тёмная тема и акцентные цвета 🎨'
    if (t.startsWith('/id')) return 'Твой номер аккаунта виден в Настройках профиля — это порядковый номер регистрации 💖'
    if (t.includes('привет') || t.includes('хай')) return 'Приветик! 🎀 Как проходит день?'
    return 'Слышу тебя! Я пока простой демо-бот, но уже стараюсь 💬 Напиши /help.'
  }
  if (botUid === 'bot-sticker') {
    const s = ['🎀', '🌸', '🫶', '🥺', '✨', '🐾', '🧸', '🍓']
    return s[Math.floor(Math.random() * s.length)].repeat(1) + ' держи стикер!'
  }
  if (botUid === 'bot-quote') {
    const q = [
      'Будь собой — остальные роли уже заняты. 💫',
      'Маленькие шаги каждый день > большой рывок раз в год. 🌸',
      'Ты справляешься лучше, чем думаешь. 🫶',
    ]
    return q[Math.floor(Math.random() * q.length)]
  }
  return '…'
}
