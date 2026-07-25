import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { Attachment } from '../../types'
import { classNames } from '../../lib/util'

const SPEEDS = [1, 1.5, 2]
const BARS = 36

/** Deterministic pseudo-waveform so every voice note gets its own pretty shape. */
function waveform(seed: string, n = BARS) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0
    const v = 0.22 + ((h % 1000) / 1000) * 0.78
    // smooth with neighbour for a nicer organic look
    out.push(i > 0 ? (v + out[i - 1]) / 2 + 0.06 : v)
  }
  const max = Math.max(...out)
  return out.map((v) => Math.min(1, v / max))
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * Custom Telegram-style voice/audio player: waveform with seek, play/pause and
 * playback speed (1× / 1.5× / 2×). No ugly native controls.
 */
export function VoicePlayer({ a }: { a: Attachment }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [elapsed, setElapsed] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const bars = useRef(waveform(a.url)).current

  // MediaRecorder-produced webm often reports Infinity — fall back to the
  // duration we measured while recording.
  const duration = () => {
    const d = audioRef.current?.duration
    return d && isFinite(d) ? d : a.durationSec ?? 0
  }

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => {
      const d = duration()
      setElapsed(el.currentTime)
      if (d > 0) setProgress(Math.min(1, el.currentTime / d))
    }
    const onEnd = () => { setPlaying(false); setProgress(0); setElapsed(0); el.currentTime = 0 }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      el.playbackRate = SPEEDS[speedIdx]
      void el.play()
      setPlaying(true)
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current
    const d = duration()
    if (!el || !d) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = frac * d
    setProgress(frac)
    setElapsed(frac * d)
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length
    setSpeedIdx(next)
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next]
  }

  const total = duration()

  return (
    <div className="flex min-w-[230px] max-w-[300px] items-center gap-2.5">
      <audio ref={audioRef} src={a.url} preload="metadata" hidden />
      <button
        onClick={toggle}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-current/20 transition hover:bg-current/30 active:scale-95"
        title={playing ? 'Пауза' : 'Слушать'}
      >
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-7 cursor-pointer items-center gap-[2px]" onClick={seek} title="Перемотать">
          {bars.map((v, i) => (
            <span
              key={i}
              className={classNames('w-[3px] flex-1 rounded-full bg-current transition-opacity', i / bars.length <= progress ? 'opacity-95' : 'opacity-35')}
              style={{ height: `${Math.round(6 + v * 20)}px` }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] leading-none opacity-80">
          <span className="tabular-nums">{playing || elapsed > 0 ? `${fmt(elapsed)} / ${fmt(total)}` : fmt(total)}</span>
          {a.kind === 'audio' && a.name && <span className="truncate">· {a.name}</span>}
          <button onClick={cycleSpeed} className="ml-auto rounded-full bg-current/15 px-1.5 py-0.5 font-bold transition hover:bg-current/25" title="Скорость">
            {SPEEDS[speedIdx]}×
          </button>
        </div>
      </div>
    </div>
  )
}
