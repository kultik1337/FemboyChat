/**
 * The app's own voice — a warm, wooden little sound pack.
 *
 * Why nothing is downloaded: shipping mp3/ogg files means a network round trip
 * before the very first «sent» click, a cache to invalidate, and a licence to
 * respect for somebody else's samples. Everything here is built in the browser
 * out of a few oscillators, a low-pass filter and an exponential decay, which
 * is exactly how a marimba or a wooden knock behaves: a bright attack that
 * loses its high partials fast. The result is a few hundred bytes that starts
 * instantly and can be re-tuned by editing numbers.
 *
 * The character of the pack:
 * - **send** — a soft bubble pop, low and short, no ring;
 * - **receive** — two marimba notes a fifth apart, with a quiet octave partial
 *   so the wood is audible;
 * - **success** — the same wood, going up;
 * - **error** — a dull low knock, deliberately not musical;
 * - **tap** — an almost subliminal tick for physical-feeling buttons.
 *
 * Rules that keep it from becoming annoying: a browser stays silent until the
 * page has been touched, both chat sounds obey the user's settings, incoming is
 * mute while the tab is hidden (the push notification has its own sound), and
 * every failure is swallowed — audio is decoration, never a broken send.
 */

import { useStore } from '../store/useStore'

export type Voice = 'send' | 'receive' | 'error' | 'tap' | 'success'

/** One struck note. Frequencies in Hz, times in seconds, gain 0..1. */
interface Note {
  freq: number
  /** Offset from the start of the voice. */
  at?: number
  /** How long the tail takes to die out. */
  dur: number
  gain?: number
  type?: OscillatorType
  /** Slide to this frequency: what turns a tone into a «pop». */
  to?: number
  /** A quiet partial an octave up gives wood its bite. */
  overtone?: number
}

interface VoiceSpec {
  notes: Note[]
  /** Low-pass cutoff: the single biggest reason this sounds soft, not beepy. */
  cutoff: number
  gain: number
}

const VOICES: Record<Voice, VoiceSpec> = {
  // A bubble leaving the composer: pitch drops, everything above 1.2 kHz is cut.
  send: {
    notes: [{ freq: 520, to: 300, dur: 0.13, gain: 0.9, type: 'sine' }],
    cutoff: 1200,
    gain: 0.5,
  },
  // Wooden two-note chime, C6 then G6, each with a soft octave partial.
  receive: {
    notes: [
      { freq: 1046.5, dur: 0.34, gain: 0.7, type: 'triangle', overtone: 0.18 },
      { freq: 1568, at: 0.11, dur: 0.44, gain: 0.55, type: 'triangle', overtone: 0.14 },
    ],
    cutoff: 2600,
    gain: 0.42,
  },
  // Same wood, a rising third: «done» without shouting.
  success: {
    notes: [
      { freq: 784, dur: 0.22, gain: 0.6, type: 'triangle', overtone: 0.16 },
      { freq: 1046.5, at: 0.09, dur: 0.34, gain: 0.5, type: 'triangle', overtone: 0.12 },
    ],
    cutoff: 2400,
    gain: 0.4,
  },
  // A knock on a table. Low, dry, unmistakably not a message.
  error: {
    notes: [{ freq: 180, to: 120, dur: 0.22, gain: 0.8, type: 'triangle' }],
    cutoff: 700,
    gain: 0.5,
  },
  // Interface tick: you feel it more than hear it.
  tap: {
    notes: [{ freq: 900, to: 700, dur: 0.05, gain: 0.5, type: 'sine' }],
    cutoff: 1600,
    gain: 0.28,
  },
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

/** Strike one note into the given destination. */
function strike(ac: AudioContext, into: AudioNode, note: Note, t0: number): void {
  const start = t0 + (note.at ?? 0)
  const end = start + note.dur
  const peak = Math.max(0.0002, note.gain ?? 0.5)

  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = note.type ?? 'sine'
  osc.frequency.setValueAtTime(note.freq, start)
  if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end)
  // Fast attack, long exponential tail: struck wood, not a switched-on buzzer.
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(gain).connect(into)
  osc.start(start)
  osc.stop(end + 0.03)

  if (note.overtone) {
    const up = ac.createOscillator()
    const upGain = ac.createGain()
    up.type = 'sine'
    up.frequency.setValueAtTime(note.freq * 2, start)
    upGain.gain.setValueAtTime(0.0001, start)
    upGain.gain.exponentialRampToValueAtTime(peak * note.overtone, start + 0.006)
    // The partial dies well before the fundamental — that is the wooden part.
    upGain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur * 0.45)
    up.connect(upGain).connect(into)
    up.start(start)
    up.stop(end + 0.03)
  }
}

/** Play one of the app's voices. Never throws, never blocks. */
export function playSound(voice: Voice): void {
  const ac = context()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume().catch(() => {})
  const spec = VOICES[voice]
  try {
    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = spec.cutoff
    filter.Q.value = 0.6
    const master = ac.createGain()
    master.gain.value = spec.gain
    filter.connect(master).connect(ac.destination)
    const t0 = ac.currentTime + 0.005
    for (const note of spec.notes) strike(ac, filter, note, t0)
  } catch {
    // A failed sound is never worth a broken action.
  }
}

/** Used by the settings screen to audition a voice on demand. */
export const previewSound = playSound

/**
 * The original name of the incoming chime, kept because the notification path
 * still calls it. New code should use `playSound`.
 */
export function beep(): void {
  playSound('receive')
}

/** Marks the one-time nudge that switches the send sound on. */
const MIGRATED_KEY = 'fc:soundPack'

/**
 * The send sound used to default to off, which is why the new pack seemed not
 * to exist: nothing played for your own messages, and the incoming chime only
 * fires for someone else's. Switch it on once, remember that it was done, and
 * never touch the setting again — turning it off must stay a decision that
 * sticks.
 */
function nudgeSendSoundOnce(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return
    const state = useStore.getState()
    if (!state.account) return
    localStorage.setItem(MIGRATED_KEY, 'cozy')
    if (state.account.settings.sendSound) return
    void state.patchSettings({ sendSound: true })
  } catch {
    // Private mode without storage: the sound simply stays as configured.
  }
}

/**
 * Watch the store and give the chat its two sounds.
 *
 * Deliberately a subscription rather than calls sprinkled through the store:
 * every path that can add a message (optimistic send, realtime, a reload of the
 * page) ends in the same place, so one watcher covers all of them and no future
 * feature has to remember to play anything.
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
    nudgeSendSoundOnce()
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
