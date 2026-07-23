// The FemboyChat logo. icon.png lives at the repo root; Vite bundles it and
// hands back a hashed asset URL, so the real image ships with the build.
import logoUrl from '../../../icon.png'

export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="FemboyChat"
      width={size}
      height={size}
      className={'shrink-0 rounded-xl object-cover shadow-md ' + className}
      style={{ width: size, height: size }}
    />
  )
}
