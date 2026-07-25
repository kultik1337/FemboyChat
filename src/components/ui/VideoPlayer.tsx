import { useEffect, useRef, useState } from 'react'
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import type { Attachment } from '../../types'
import { classNames } from '../../lib/util'

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * Custom video player: big play button, gradient control bar with seek,
 * mute and fullscreen. Controls fade out while playing, как в Telegram.
 */
export function VideoPlayer({ a, fill }: { a: Attachment; fill?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(a.durationSec ?? 0)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onTime = () => {
      setElapsed(el.currentTime)
      if (el.duration && isFinite(el.duration)) setProgress(el.currentTime / el.duration)
    }
    const onMeta = () => { if (el.duration && isFinite(el.duration)) setDuration(el.duration) }
    const onEnd = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('ended', onEnd)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [])

  function toggle() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = videoRef.current
    if (!el || !duration) return
    const frac = parseFloat(e.target.value)
    el.currentTime = frac * duration
    setProgress(frac)
  }

  function fullscreen(e: React.MouseEvent) {
    e.stopPropagation()
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }

  return (
    <div ref={wrapRef} className={classNames('group/video relative bg-black/20', fill ? 'w-full' : 'max-w-full')}>
      <video
        ref={videoRef}
        src={a.url}
        preload="metadata"
        playsInline
        muted={muted}
        onClick={toggle}
        className={classNames('block max-h-80 max-w-full cursor-pointer [.group\\/video:fullscreen_&]:max-h-full [.group\\/video:fullscreen_&]:h-full [.group\\/video:fullscreen_&]:w-full [.group\\/video:fullscreen_&]:object-contain', fill && 'w-full')}
      />

      {/* big center play button */}
      {!playing && (
        <button
          onClick={toggle}
          className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-[2px] transition hover:scale-105 active:scale-95"
          title="Смотреть"
        >
          <Play size={26} fill="currentColor" className="ml-1" />
        </button>
      )}

      {/* bottom control bar */}
      <div
        className={classNames(
          'absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-5 text-white transition-opacity',
          playing ? 'opacity-0 group-hover/video:opacity-100' : 'opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={toggle} className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-white/20">
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={seek}
          className="video-seek min-w-0 flex-1"
        />
        <span className="shrink-0 text-[10px] tabular-nums opacity-90">{fmt(elapsed)} / {fmt(duration)}</span>
        <button onClick={() => setMuted((m) => !m)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-white/20" title="Звук">
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <button onClick={fullscreen} className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-white/20" title="На весь экран">
          <Maximize size={14} />
        </button>
      </div>
    </div>
  )
}
