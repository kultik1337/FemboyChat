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
// Node 18+ has global BroadcastChannel and crypto.randomUUID.

import assert from 'node:assert'
import { LocalBackend } from '../src/lib/backend/local'

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

async function main() {
  const be = new LocalBackend()
  await be.init()
  let pass = 0
  const ok = (label: string, cond: boolean) => { assert(cond, '❌ ' + label); pass++; console.log('✓', label) }

  // 1. request code (new user) returns a demo code + isNew
  const req = await be.requestCode('test@example.com', 'test_user', 'Тест')
  ok('requestCode returns demo code for new user', req.ok && req.isNew && !!req.devCode)

  // 2. username too short is rejected
  const bad = await be.requestCode('x@y.com', 'ab')
  ok('short username rejected', !bad.ok)

  // 3. verify with wrong code fails, correct code creates account with sequential id
  const wrong = await be.verifyCode('test@example.com', '000000')
  ok('wrong code rejected', !wrong.ok)
  const res = await be.verifyCode('test@example.com', req.devCode!)
  ok('verify creates account', res.ok && !!res.account)
  const me = res.account!
  ok('sequential numeric id assigned (#9 after 8 seeds)', me.numId === 9)

  // 4. onboarding chats exist
  const chats = await be.listChats()
  ok('has Saved Messages', chats.some((c) => c.type === 'saved'))
  ok('has FemBot chat', chats.some((c) => c.type === 'bot'))
  ok('joined news channel + lounge group', chats.some((c) => c.id === 'chan-news') && chats.some((c) => c.id === 'grp-lounge'))

  // 5. universal search across kinds
  ok('search finds a person (cardo)', be.searchDirectory('cardo').some((d) => d.kind === 'user'))
  ok('search finds a channel', be.searchDirectory('news').some((d) => d.kind === 'channel'))
  ok('search finds a bot', be.searchDirectory('fembot').some((d) => d.kind === 'bot'))
  ok('search by numeric id works', be.searchDirectory('1').some((d) => d.numId === 1))
  ok('empty search returns trending', be.searchDirectory('').length > 0)

  // 6. open DM and send a message
  const dm = await be.openDM('seed-mia')
  const events: string[] = []
  be.subscribe((e) => events.push(e.type))
  await be.send({ chatId: dm.id, senderUid: me.uid, text: 'привет 🎀', reactions: [] as any } as any)
  let msgs = await be.listMessages(dm.id)
  ok('message stored', msgs.length === 1 && msgs[0].text === 'привет 🎀')
  ok('message event emitted', events.includes('message'))

  // 7. react + edit + pin
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

  // 8. bot auto-reply
  const botDm = chats.find((c) => c.type === 'bot')!
  await be.send({ chatId: botDm.id, senderUid: me.uid, text: '/help', reactions: [] } as any)
  await sleep(1800)
  const botMsgs = await be.listMessages(botDm.id)
  ok('bot replied to /help', botMsgs.some((m) => m.senderUid !== me.uid && m.text.includes('Команды')))

  // 9. create a group and channel; channel posting restricted for non-admins handled in UI
  const grp = await be.createChat({ type: 'group', title: 'Тестовая', emoji: '💬' })
  ok('group created & searchable', be.searchDirectory('Тестовая').length > 0 && grp.adminUids.includes(me.uid))

  // 10. cross-tab realtime via a second backend instance (shared storage + BroadcastChannel)
  const be2 = new LocalBackend()
  await be2.init()
  const got: string[] = []
  be2.subscribe((e) => { if (e.type === 'message') got.push((e as any).message.text) })
  await be.send({ chatId: dm.id, senderUid: me.uid, text: 'через вкладку 📨', reactions: [] } as any)
  await sleep(150)
  ok('second tab received message via BroadcastChannel', got.includes('через вкладку 📨'))

  console.log(`\n🎉 Все ${pass} проверок пройдены.`)
  process.exit(0)
}

const watchdog = setTimeout(() => { console.error('⏱️ timeout'); process.exit(1) }, 20000)
watchdog.unref?.()
main().catch((e) => { console.error(e); process.exit(1) })
