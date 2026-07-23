let ctx: AudioContext | null = null

/** A short, soft two-note chime for incoming messages. */
export function beep() {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = ctx.currentTime
    const notes = [880, 1320]
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.09
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.06, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.2)
    })
  } catch {
    /* audio not available */
  }
}
