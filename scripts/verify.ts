// Headless functional test for the in-browser LocalBackend.
// Provides minimal web-global shims so the browser code runs under Node.

class MemStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  clear() { this.m.clear() }
}

;(globalThis as any).localStorage = new MemStorage()
;(globalThis as any).sessionStorage = new MemStorage()
;(globalThis as any).window = { addEventListener() {}, removeEventListener() {} }
// Node 18+ has global BroadcastChannel, Blob, btoa and crypto.randomUUID.

import assert from 'node:assert'
import { LocalBackend } from '../src/lib/backend/local'

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

async function main() {
  const be = new LocalBackend()
  await be.init()
  let pass = 0
  const ok = (label: string, cond: boolean) => { assert(cond, '❌ ' + label); pass++; console.log('✓', label) }

  // 1. register with e-mail + password creates an account with a sequential id
  const bad = await be.register('x@y.com', 'ab', 'X', 'secret123')
  ok('short username rejected', !bad.ok)
  const badPw = await be.register('x@y.com', 'test_user', 'X', '123')
  ok('short password rejected', !badPw.ok)
  const res = await be.register('test@example.com', 'test_user', 'Тест', 'secret123')
  ok('register creates account', res.ok && !!res.account)
  const me = res.account!
  ok('sequential numeric id assigned (#9 after 8 seeds)', me.numId === 9)

  // 2. login with the same credentials works; wrong password fails
  await be.logout()
  const badLogin = await be.login('test@example.com', 'wrongpass')
  ok('wrong password rejected', !badLogin.ok)
  const login = await be.login('test@example.com', 'secret123')
  ok('login works', login.ok && login.account?.uid === me.uid)

  // 3. onboarding chats exist
  const chats = await be.listChats()
  ok('has Saved Messages', chats.some((c) => c.type === 'saved'))
  ok('has FemBot chat', chats.some((c) => c.type === 'bot'))
  ok('joined news channel + lounge group', chats.some((c) => c.id === 'chan-news') && chats.some((c) => c.id === 'grp-lounge'))

  // 4. universal search across kinds
  ok('search finds a person (cardo)', be.searchDirectory('cardo').some((d) => d.kind === 'user'))
  ok('search finds a channel', be.searchDirectory('news').some((d) => d.kind === 'channel'))
  ok('search finds a bot', be.searchDirectory('fembot').some((d) => d.kind === 'bot'))
  ok('search by numeric id works', be.searchDirectory('1').some((d) => d.numId === 1))
  ok('empty search returns trending', be.searchDirectory('').length > 0)

  // 5. open DM and send a message
  const dm = await be.openDM('seed-mia')
  const events: string[] = []
  be.subscribe((e) => events.push(e.type))
  await be.send({ chatId: dm.id, senderUid: me.uid, text: 'привет 🎀' } as any)
  let msgs = await be.listMessages(dm.id)
  ok('message stored', msgs.length === 1 && msgs[0].text === 'привет 🎀')
  ok('message event emitted', events.includes('message'))

  // 6. react + edit + pin
  const mid = msgs[0].id
  await be.react(dm.id, mid, '❤️')
  msgs = await be.listMessages(dm.id)
  ok('reaction added', msgs[0].reactions[0]?.emoji === '❤️' && msgs[0].reactions[0].uids.includes(me.uid))
  await be.edit(dm.id, mid, 'привет всем 🎀')
  msgs = await be.listMessages(dm.id)
  ok('edit applied', msgs[0].text === 'привет всем 🎀' && !!msgs[0].editedTs)
  await be.pin(dm.id, mid)
  msgs = await be.listMessages(dm.id)
  ok('pin toggled', msgs[0].pinned === true)

  // 7. file upload → attachment message (photos / videos / files / voice)
  const file = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
  const { url } = await be.uploadFile('attachment', file)
  ok('upload returns a data: URL in demo mode', url.startsWith('data:image/png;base64,'))
  await be.send({
    chatId: dm.id,
    senderUid: me.uid,
    text: 'смотри что нашёл',
    attachment: { kind: 'image', url, name: 'pic.png', size: 8, mime: 'image/png' },
  } as any)
  msgs = await be.listMessages(dm.id)
  const withAtt = msgs[msgs.length - 1]
  ok('attachment stored with caption', withAtt.attachment?.kind === 'image' && withAtt.attachment.url === url && withAtt.text === 'смотри что нашёл')

  let threw = false
  try {
    await be.uploadFile('attachment', new Blob([new Uint8Array(4 * 1024 * 1024)], { type: 'video/mp4' }))
  } catch { threw = true }
  ok('oversized demo upload rejected (>3 МБ)', threw)

  // 8. custom avatar propagates to the directory
  const { url: avatarUrl } = await be.uploadFile('avatar', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
  await be.updateAccount({ avatarUrl })
  ok('avatar saved to directory', be.getDirectoryList().some((d) => d.uid === me.uid && d.avatarUrl === avatarUrl))

  // 9. bot auto-reply
  const botDm = chats.find((c) => c.type === 'bot')!
  await be.send({ chatId: botDm.id, senderUid: me.uid, text: '/help' } as any)
  await sleep(1800)
  const botMsgs = await be.listMessages(botDm.id)
  ok('bot replied to /help', botMsgs.some((m) => m.senderUid !== me.uid && m.text.includes('Команды')))

  // 10. create a group and channel; channel posting restricted for non-admins handled in UI
  const grp = await be.createChat({ type: 'group', title: 'Тестовая', emoji: '💬' })
  ok('group created & searchable', be.searchDirectory('Тестовая').length > 0 && grp.adminUids.includes(me.uid))

  // 11. cross-tab realtime via a second backend instance (shared storage + BroadcastChannel)
  const be2 = new LocalBackend()
  await be2.init()
  const got: string[] = []
  be2.subscribe((e) => { if (e.type === 'message') got.push((e as any).message.text) })
  await be.send({ chatId: dm.id, senderUid: me.uid, text: 'через вкладку 📨' } as any)
  await sleep(150)
  ok('second tab received message via BroadcastChannel', got.includes('через вкладку 📨'))

  console.log(`\n🎉 Все ${pass} проверок пройдены.`)
  process.exit(0)
}

const watchdog = setTimeout(() => { console.error('⏱️ timeout'); process.exit(1) }, 20000)
watchdog.unref?.()
main().catch((e) => { console.error(e); process.exit(1) })
