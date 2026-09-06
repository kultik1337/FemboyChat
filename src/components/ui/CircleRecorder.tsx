import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Send, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { MAX_CIRCLE_SEC, squareCrop } from '../../lib/media'

/**
 * Запись видеосообщения-кружка.
 *
 * Кадр с камеры почти никогда не квадратный, а кружок — квадратный по своей
 * природе. Поэтому пишется не поток с камеры напрямую, а холст: каждый кадр
 * на него ложится уже обрезанным по центру, и `canvas.captureStream()` даёт
 * настоящее квадратное видео. Обрезать только при показе было бы дешевле, но
 * тогда в скачанном файле осталась бы вся комната по краям — то есть кусок
 * кадра, который человек, отправляя кружок, показывать не собирался.
 *
 * Звук берётся из исходного потока и подмешивается в тот же MediaRecorder.
 */

/** Сторона квадрата записи. 480 — заметно легче 720 и на кружке неотличимо. */
const SIDE = 480

const FPS = 30

/** Кодеки по убыванию желаемости. Первый поддержанный и берём. */
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
]

export function CircleRecorder({
  onCancel,
  onDone,
}: {
  onCancel: () => void
  onDone: (blob: Blob, durationSec: number) => void
}) {
  const toast = useStore((s) => s.toast)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const startRef = useRef(0)
  const rafRef = useRef(0)
  const streamsRef = useRef<MediaStream[]>([])

  const [elapsed, setElapsed] = useState(0)
  const [state, setState] = useState<'starting' | 'recording' | 'saving'>('starting')

  /** Гасим камеру и микрофон. Обязательно на любом выходе — иначе горит лампочка. */
  function stopTracks() {
    cancelAnimationFrame(rafRef.current)
    for (const s of streamsRef.current) s.getTracks().forEach((t) => t.stop())
    streamsRef.current = []
  }

  function finish(send: boolean) {
    cancelledRef.current = !send
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') {
      if (send) setState('saving')
      rec.stop()
    } else if (!send) {
      onCancel()
    }
  }

  useEffect(() => {
    let alive = true
    let tick: ReturnType<typeof setInterval> | null = null

    ;(async () => {
      let camera: MediaStream
      try {
        camera = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
          audio: true,
        })
      } catch {
        toast('Нет доступа к камере или микрофону 🥺', '📹')
        onCancel()
        return
      }
      if (!alive) {
        camera.getTracks().forEach((t) => t.stop())
        return
      }
      streamsRef.current.push(camera)

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      video.srcObject = camera
      video.muted = true
      try {
        await video.play()
      } catch {
        /* автозапуск может отказать — кадры всё равно пойдут в холст */
      }

      canvas.width = SIDE
      canvas.height = SIDE
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        toast('Браузер не дал холст для записи', '📹')
        stopTracks()
        onCancel()
        return
      }

      /*
        Зеркалить нужно только превью, но не запись.

        Фронталка показывает человека отражённым — иначе он не узнаёт своих
        движений. Но собеседник должен увидеть его таким, какой он есть: если
        отражение запечь в файл, любая надпись в кадре — на футболке, на стене,
        на экране за спиной — придёт к получателю задом наперёд. Поэтому холст
        пишется как есть, а зеркало живёт в CSS-классе самого холста и дальше
        экрана не уходит.
      */

      const drawFrame = () => {
        if (video.videoWidth && video.videoHeight) {
          const { x, y, side } = squareCrop(video.videoWidth, video.videoHeight)
          ctx.drawImage(video, x, y, side, side, 0, 0, SIDE, SIDE)
        }
        rafRef.current = requestAnimationFrame(drawFrame)
      }
      drawFrame()

      const canvasStream = canvas.captureStream(FPS)
      streamsRef.current.push(canvasStream)
      for (const track of camera.getAudioTracks()) canvasStream.addTrack(track)

      const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
      let rec: MediaRecorder
      try {
        /*
          Битрейт задан явно и намеренно скромно. По умолчанию браузер пишет
          кружок с запасом на полноразмерное видео, и минута весит десятки
          мегабайт — при том, что показывается он размером с монету. Заодно
          это единственное, что удерживает кружок в пределах трёх мегабайт
          демо-режима, где вложение целиком лежит в localStorage.
        */
        rec = new MediaRecorder(canvasStream, {
          ...(mime ? { mimeType: mime } : {}),
          videoBitsPerSecond: 900_000,
          audioBitsPerSecond: 64_000,
        })
      } catch {
        toast('Браузер не умеет записывать видео 🥺', '📹')
        stopTracks()
        onCancel()
        return
      }
      recRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
      rec.onstop = () => {
        stopTracks()
        if (cancelledRef.current) {
          onCancel()
          return
        }
        const durationSec = Math.round((Date.now() - startRef.current) / 1000)
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' })
        if (durationSec < 1 || blob.size === 0) {
          toast('Слишком коротко — скажи что-нибудь в камеру 🎀', '📹')
          onCancel()
          return
        }
        onDone(blob, durationSec)
      }

      startRef.current = Date.now()
      rec.start(250)
      setState('recording')
      tick = setInterval(() => {
        const sec = Math.floor((Date.now() - startRef.current) / 1000)
        setElapsed(sec)
        // Дальше минуты это уже не сообщение, а ролик — дошли до предела и шлём
        // то, что записалось, вместо того чтобы молча выкинуть запись.
        if (sec >= MAX_CIRCLE_SEC) finish(true)
      }, 250)
    })()

    return () => {
      alive = false
      if (tick) clearInterval(tick)
      // Размонтирование без явного «отправить» — это отмена.
      if (recRef.current && recRef.current.state !== 'inactive') {
        cancelledRef.current = true
        recRef.current.stop()
      }
      stopTracks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const left = Math.max(0, MAX_CIRCLE_SEC - elapsed)
  const progress = Math.min(1, elapsed / MAX_CIRCLE_SEC)

  // Портал по той же причине, что и у редактора: `will-change` на экране чата
  // делает его содержащим блоком для `position: fixed`.
  return createPortal(
    <div className="fixed inset-0 z-[88] flex flex-col items-center justify-center gap-6 bg-[rgba(8,5,12,0.92)] p-6 animate-fade-in" style={{ backdropFilter: 'blur(6px)' }}>
      {/*
        Источник кадров. Спрятан размером и прозрачностью, а не `display: none`:
        у выключенного из потока элемента браузер вправе не декодировать видео
        вовсе, и тогда `drawImage` кладёт на холст пустоту — запись выходит
        чёрной. Элемент остаётся в разметке, но занимает пиксель и не ловит
        события.
      */}
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden
        className="pointer-events-none absolute h-px w-px opacity-0"
      />

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-[min(70vw,320px)] w-[min(70vw,320px)] -scale-x-100 rounded-full bg-black object-cover shadow-2xl"
        />
        {/* Кольцо-таймер по краю кружка: видно, сколько осталось, не читая цифр. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2.5" />
          <circle
            cx="50"
            cy="50"
            r="48.5"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${progress * 304.7} 304.7`}
            style={{ transition: 'stroke-dasharray 0.25s linear' }}
          />
        </svg>
        {state === 'starting' && (
          <div className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white">
            <Loader2 size={28} className="animate-spin" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-white">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
        <span className="text-sm font-bold tabular-nums">
          {String(Math.floor(elapsed / 60))}:{String(elapsed % 60).padStart(2, '0')}
        </span>
        <span className="text-sm text-white/60">· осталось {left} с</span>
      </div>

      <div className="flex items-center gap-8">
        <button
          onClick={() => finish(false)}
          className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-rose-400 transition hover:bg-white/20"
          title="Отменить"
        >
          <Trash2 size={22} />
        </button>
        <button
          onClick={() => finish(true)}
          disabled={state !== 'recording'}
          className="grid h-16 w-16 place-items-center rounded-full accent-gradient text-white shadow-xl transition hover:brightness-105 active:scale-95 disabled:opacity-50"
          title="Отправить"
        >
          {state === 'saving' ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
        </button>
      </div>
    </div>,
    document.body,
  )
}
