/**
 * The app's own voice.
 *
 * There are no sound files in the repo on purpose: a handful of short blips as
 * mp3 would weigh more than the whole JS bundle gzipped, would need a CDN round
 * trip before the very first «sent» click, and would still sound like somebody
 * else's messenger. Everything here is synthesised in the browser with two
 * oscillators and an envelope, so it costs a few hundred bytes, starts
 * instantly, and can be re-tuned by editing numbers.
 *
 * Rules that keep it from becoming annoying:
 * - a browser refuses to make noise before the first gesture, so the context is
 *   created lazily and resumed on the first tap/keypress;
 * - the two chat sounds obey the settings the user already has: `sendSound`
 *   for outgoing, `notifySound` for incoming;
 * - incoming is silent while the tab is hidden — that case belongs to the push
 *   notification, which brings its own sound;
 * - nothing is ever awaited and every failure is swallowed: audio is decoration.
 */

import { useStore } from '../store/useStore'

export type Voice = 'send' | 'receive' | 'error' | 'tap' | 'success'

/** One partial of a sound: a swept tone with its own slot in time. */
interface Tone {
  from: number
  to?: number
  at?: number
  dur: number
  gain?: number
  type?: OscillatorType
}

const VOICES: Record<Voice, Tone[]> = {
  // Outgoing: a light upward flick, gone before you notice it.
  send: [{ from: 620, to: 940, dur: 0.1, gain: 0.05 }],
  // Incoming: two soft notes, a fifth apart — friendly, not a doorbell.
  receive: [
    { from: 880, dur: 0.09, gain: 0.045, type: 'triangle' },
    { from: 1320, at: 0.075, dur: 0.13, gain: 0.04, type: 'triangle' },
  ],
  // Something went wrong: low, short, unmistakably not a message.
  error: [{ from: 300, to: 170, dur: 0.18, gain: 0.05, type: 'sawtooth' }],
  // Confirmation of a deliberate action (saved, copied, joined).
  success: [
    { from: 660, dur: 0.07, gain: 0.04, type: 'triangle' },
    { from: 990, at: 0.06, dur: 0.1, gain: 0.035, type: 'triangle' },
  ],
  // UI tick: almost subliminal, for taps that need to feel physical.
  tap: [{ from: 1100, dur: 0.03, gain: 0.02, type: 'square' }],
}

let ctx: AudioContext | null = null
let unlocked = false

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  return ctx
}

/** Browsers keep the context suspended until the page has been touched. */
function unlock(): void {
  if (unlocked) return
  unlocked = true
  void context()?.resume().catch(() => {})
}

/** Play one of the app's voices. Never throws, never blocks. */
export function playSound(voice: Voice): void {
  const ac = context()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume().catch(() => {})
  const now = ac.currentTime
  for (const tone of VOICES[voice]) {
    try {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      const start = now + (tone.at ?? 0)
      const end = start + tone.dur
      const peak = tone.gain ?? 0.04
      osc.type = tone.type ?? 'sine'
      osc.frequency.setValueAtTime(tone.from, start)
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end)
      // A tiny attack and a smooth tail: a bare on/off would click.
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      osc.connect(gain).connect(ac.destination)
      osc.start(start)
      osc.stop(end + 0.02)
    } catch {
      // A single failed tone is not worth a broken send.
    }
  }
}

/**
 * The original name of the incoming chime, kept because the notification path
 * still calls it. New code should use `playSound`.
 */
export function beep(): void {
  playSound('receive')
}

/**
 * Watch the store and give the chat its two sounds.
 *
 * Deliberately a subscription rather than calls sprinkled through the store:
 * every path that can add a message (optimistic send, realtime, a reload of the
 * page) ends in the same place, so one watcher covers all of them and no future
 * feature has to remember to play anything.
 *
 * The incoming sound is skipped for the chat that is open on screen only when
 * the store's own notifier already handled it — see the throttle below.
 */
export function initSounds(): void {
  if (typeof window === 'undefined') return

  for (const evt of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(evt, unlock, { once: true, passive: true })
  }

  /** Last message already accounted for, per chat. */
  const seen = new Map<string, { id: string; ts: number }>()
  /** Outgoing is throttled: the optimistic row and its confirmation are one send. */
  let lastSendAt = 0
  /** Incoming is throttled too, so a burst of arrivals is one chime. */
  let lastReceiveAt = 0

  useStore.subscribe((state) => {
    const account = state.account
    if (!account) return
    const settings = account.settings

    for (const [chatId, list] of Object.entries(state.messages)) {
      const last = list[list.length - 1]
      if (!last) continue
      const prev = seen.get(chatId)
      seen.set(chatId, { id: last.id, ts: last.ts })
      // First sighting of a chat is history, not an event.
      if (!prev) continue
      if (last.id === prev.id || last.ts < prev.ts) continue
      if (last.system || last.deleted) continue

      const now = Date.now()
      if (last.senderUid === account.uid) {
        if (!settings.sendSound) continue
        if (now - lastSendAt < 1200) continue
        lastSendAt = now
        playSound('send')
      } else {
        if (!settings.notifySound) continue
        // A hidden tab is the push notification's job, not ours.
        if (typeof document !== 'undefined' && document.hidden) continue
        // The store already chimes for a chat that is not open; do not double it.
        if (chatId !== state.activeChatId) continue
        if (now - lastReceiveAt < 900) continue
        lastReceiveAt = now
        playSound('receive')
      }
    }
  })
}
