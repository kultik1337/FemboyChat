import { classNames } from '../../lib/util'

export function Avatar({
  emoji,
  color,
  size = 44,
  online,
  ring,
}: {
  emoji: string
  color: string
  size?: number
  online?: boolean
  ring?: boolean
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={classNames(
          'grid place-items-center rounded-full text-white select-none',
          ring && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--panel)]',
        )}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.5,
          background: `linear-gradient(135deg, ${color}, ${shift(color)})`,
        }}
      >
        <span>{emoji}</span>
      </div>
      {online !== undefined && (
        <span
          className={classNames(
            'absolute bottom-0 right-0 rounded-full border-2 border-[var(--panel)]',
            online ? 'bg-emerald-400' : 'bg-transparent',
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  )
}

function shift(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  const r = Math.min(255, (n >> 16) + 30)
  const g = Math.min(255, ((n >> 8) & 0xff) + 10)
  const b = Math.min(255, (n & 0xff) + 40)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
