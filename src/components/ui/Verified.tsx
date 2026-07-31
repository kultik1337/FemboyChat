/**
 * The «verified» badge shown next to official channels, groups and bots.
 *
 * It used to be a bare ✔ character, which meant every platform drew it
 * differently — a thin grey glyph on Windows, a fat green one on Android — and
 * it never lined up with the name next to it. This is a real badge instead:
 * two rounded squares rotated against each other make the classic scalloped
 * seal, filled with the account's own accent gradient so it follows whatever
 * theme the user picked.
 */
export function Verified({ size = 15, title = 'Официальный аккаунт' }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      className="shrink-0 translate-y-[0.5px]"
    >
      <title>{title}</title>
      <defs>
        {/* A duplicated id across instances is harmless: every copy is identical. */}
        <linearGradient id="fc-verified-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <g fill="url(#fc-verified-grad)">
        <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5.6" />
        <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5.6" transform="rotate(45 12 12)" />
      </g>
      <path
        d="M8.1 12.3l2.6 2.6 5.2-5.4"
        fill="none"
        stroke="var(--accent-contrast, #fff)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
