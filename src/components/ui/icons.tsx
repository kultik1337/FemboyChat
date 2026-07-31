/**
 * FemboyChat's own icon set.
 *
 * lucide is a fine library, but it is *everyone's* library: the same rounded
 * 24×2 strokes ship in half the web, and a messenger that wants a face of its
 * own cannot borrow one. These are drawn here, in a deliberately softer key:
 *
 * - a 24×24 box with a **1.7** stroke instead of lucide's 2 — lighter on a
 *   phone, less shouty next to our text;
 * - round caps and joins everywhere, no sharp corners anywhere in the set;
 * - shapes are slightly plumper than the originals (the speech bubble, the
 *   heart, the sticker) so the whole set reads as friendly rather than
 *   technical.
 *
 * The exported names match the lucide names we already use, so switching a
 * screen over is a one-line change of the import and nothing else. Anything not
 * drawn here yet keeps coming from lucide until it is.
 */

import type { SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Matches the lucide API: one number for both sides. */
  size?: number | string
  strokeWidth?: number
}

/**
 * Every icon is this frame plus a path. Keeping the frame in one place is what
 * guarantees the set stays consistent when new icons are added later.
 */
function Icon({ size = 20, strokeWidth = 1.7, children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/* --------------------------------------------------------------- messaging */

/** A paper plane leaning forward, with the fold drawn in. */
export function Send(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.6 3.6 3.9 9.9c-.9.4-.8 1.7.1 1.9l6.4 1.8 1.8 6.4c.3.9 1.5 1 1.9.1l6.3-16.7c.3-.7-.4-1.4-1.1-1.1Z" />
      <path d="m10.4 13.6 4.4-4.4" />
    </Icon>
  )
}

/** A plump speech bubble. */
export function MessageCircle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.6c-4.7 0-8.4 3.2-8.4 7.2 0 2.2 1.1 4.2 2.9 5.5v3.4l3.2-1.7c.7.2 1.5.3 2.3.3 4.7 0 8.4-3.2 8.4-7.5S16.7 3.6 12 3.6Z" />
    </Icon>
  )
}

/** Reply: an arrow curving back to the left. */
export function CornerUpLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8.5 5.5-4 4 4 4" />
      <path d="M4.5 9.5h8.8c3.1 0 5.7 2.5 5.7 5.7v3.3" />
    </Icon>
  )
}

/** Forward: the same arrow, mirrored. */
export function Forward(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15.5 5.5 4 4-4 4" />
      <path d="M19.5 9.5h-8.8c-3.1 0-5.7 2.5-5.7 5.7v3.3" />
    </Icon>
  )
}

/** Sent. */
export function Check(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.5 12.8 4.6 4.5L19.5 6.7" />
    </Icon>
  )
}

/** Read: two ticks, the second riding slightly ahead. */
export function CheckCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m2.5 12.8 4.3 4.3L15.8 8" />
      <path d="m10.6 15.9 1.2 1.2L21.5 8" />
    </Icon>
  )
}

/** Pending: a clock with soft hands. */
export function Clock(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l2.8 1.9" />
    </Icon>
  )
}

/* ------------------------------------------------------------- composer bar */

/** A rounder, happier smiley than the stock one. */
export function Smile(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.6 13.6c.7 1.5 1.9 2.3 3.4 2.3s2.7-.8 3.4-2.3" />
      <path d="M9.2 9.5h.01M14.8 9.5h.01" strokeWidth={2.2} />
    </Icon>
  )
}

/** A sticker: a square with the corner peeled back. */
export function Sticker(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12.4V8.2A4.2 4.2 0 0 0 15.8 4H8.2A4.2 4.2 0 0 0 4 8.2v7.6A4.2 4.2 0 0 0 8.2 20h4.2" />
      <path d="M20 12.4h-3.4a4.2 4.2 0 0 0-4.2 4.2V20c1-.1 1.8-.5 2.6-1.2l3.8-3.8c.7-.8 1.1-1.6 1.2-2.6Z" />
      <path d="M9 9.8h.01M14.2 9.8h.01" strokeWidth={2.2} />
    </Icon>
  )
}

/** A paperclip with a soft hook. */
export function Paperclip(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 11.3 12 18.3a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3.1 3.1 0 0 1 4.4 4.4l-7.6 7.6a1.6 1.6 0 0 1-2.2-2.2l6.9-6.9" />
    </Icon>
  )
}

/** A microphone with a stand. */
export function Mic(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="2.8" width="6" height="11.4" rx="3" />
      <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0" />
      <path d="M12 17.8v3.4" />
    </Icon>
  )
}

/* ------------------------------------------------------------------ actions */

export function Plus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function X(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6" />
    </Icon>
  )
}

export function Search(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="m15.6 15.6 4 4" />
    </Icon>
  )
}

export function Trash2(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.8 6.6h14.4" />
      <path d="M9.4 6.6V5.2c0-.8.6-1.4 1.4-1.4h2.4c.8 0 1.4.6 1.4 1.4v1.4" />
      <path d="M6.6 6.6l.8 11.6c.1 1.1 1 2 2.1 2h5c1.1 0 2-.9 2.1-2l.8-11.6" />
      <path d="M10.4 10.4v5.6M13.6 10.4v5.6" />
    </Icon>
  )
}

export function Pencil(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.6 4.6a2.3 2.3 0 0 1 3.8 2.4L9.8 18.6l-4.4 1.2 1.2-4.4Z" />
      <path d="m14.4 6 3.6 3.6" />
    </Icon>
  )
}

export function Copy(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8.6" y="8.6" width="11" height="11" rx="3" />
      <path d="M15.4 5.6a3 3 0 0 0-3-2.2h-4a5 5 0 0 0-5 5v4a3 3 0 0 0 2.2 3" />
    </Icon>
  )
}

export function Pin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.3 3.6h5.4l-.7 5.1 3.2 3.1c.6.6.2 1.6-.6 1.6H7.4c-.8 0-1.2-1-.6-1.6l3.2-3.1Z" />
      <path d="M12 13.4v7" />
    </Icon>
  )
}

export function Download(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.8v10.8" />
      <path d="m7.6 10.6 4.4 4.4 4.4-4.4" />
      <path d="M4.6 17.4v.8a2.4 2.4 0 0 0 2.4 2.4h10a2.4 2.4 0 0 0 2.4-2.4v-.8" />
    </Icon>
  )
}

export function MoreHorizontal(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.6 12h.01M12 12h.01M18.4 12h.01" strokeWidth={2.4} />
    </Icon>
  )
}

export function MoreVertical(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5.6v.01M12 12v.01M12 18.4v.01" strokeWidth={2.4} />
    </Icon>
  )
}

export function ArrowDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.6v14.8" />
      <path d="m5.8 13.2 6.2 6.2 6.2-6.2" />
    </Icon>
  )
}

export function ArrowLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19.4 12H4.6" />
      <path d="m10.8 5.8-6.2 6.2 6.2 6.2" />
    </Icon>
  )
}

export function ChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6.4 9.4 5.6 5.4 5.6-5.4" />
    </Icon>
  )
}

export function ChevronUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6.4 14.6 5.6-5.4 5.6 5.4" />
    </Icon>
  )
}

/* ------------------------------------------------------------------ people */

export function UserRound(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.4" r="4" />
      <path d="M4.8 20.2c.8-3.4 3.7-5.4 7.2-5.4s6.4 2 7.2 5.4" />
    </Icon>
  )
}

export function Users(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9.6" cy="8.4" r="3.6" />
      <path d="M3.4 19.8c.7-3.1 3.2-4.9 6.2-4.9s5.5 1.8 6.2 4.9" />
      <path d="M16.2 5.2a3.6 3.6 0 0 1 0 6.6" />
      <path d="M18 15.4c1.4.7 2.3 2 2.7 3.6" />
    </Icon>
  )
}

/** A channel: a megaphone with two little waves. */
export function Megaphone(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.4 10.2v3.6c0 .9.7 1.6 1.6 1.6h1.6l7.6 4V4.6l-7.6 4H6c-.9 0-1.6.7-1.6 1.6Z" />
      <path d="M8 15.4v3.4c0 .9.7 1.6 1.6 1.6s1.6-.7 1.6-1.6v-1.8" />
      <path d="M18.6 9.4a3.4 3.4 0 0 1 0 5.2" />
    </Icon>
  )
}

/** A bot: a rounded head with two eyes and an antenna. */
export function Bot(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.8" y="7.6" width="16.4" height="12.6" rx="4.2" />
      <path d="M12 3.4v4.2" />
      <circle cx="12" cy="3" r="1.2" />
      <path d="M9 13h.01M15 13h.01" strokeWidth={2.4} />
      <path d="M9.6 16.8h4.8" />
    </Icon>
  )
}

/* ------------------------------------------------------------------- states */

export function Bell(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.4a5.8 5.8 0 0 0-5.8 5.8c0 4.2-1.4 5.6-1.4 5.6h14.4s-1.4-1.4-1.4-5.6A5.8 5.8 0 0 0 12 3.4Z" />
      <path d="M10.2 18.2a2 2 0 0 0 3.6 0" />
    </Icon>
  )
}

export function BellOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.4A5.8 5.8 0 0 1 17.8 9.2c0 4.2 1.4 5.6 1.4 5.6H9.6" />
      <path d="M6.3 6.9a5.8 5.8 0 0 0-.1 2.3c0 4.2-1.4 5.6-1.4 5.6h2.6" />
      <path d="M10.2 18.2a2 2 0 0 0 3.6 0" />
      <path d="m3.6 3.6 16.8 16.8" />
    </Icon>
  )
}

export function Eye(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

export function EyeOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.6 6.2A9.6 9.6 0 0 1 12 5.8c6 0 9.4 6.2 9.4 6.2a17 17 0 0 1-3 3.8" />
      <path d="M6.4 7.8A16.6 16.6 0 0 0 2.6 12S6 18.2 12 18.2c1.3 0 2.5-.3 3.5-.7" />
      <path d="m3.6 3.6 16.8 16.8" />
      <path d="M10.2 10.4a3 3 0 0 0 3.9 4" />
    </Icon>
  )
}

export function Settings(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.2 14.2a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4.9Z" />
    </Icon>
  )
}

/** A heart with a slightly rounder dip — the app's favourite shape. */
export function Heart(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20.2s-7.8-4.6-7.8-9.6a4.4 4.4 0 0 1 7.8-2.8 4.4 4.4 0 0 1 7.8 2.8c0 5-7.8 9.6-7.8 9.6Z" />
    </Icon>
  )
}

export function Sparkles(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.6 13.5 8l4.4 1.5-4.4 1.5L12 15.4l-1.5-4.4L6.1 9.5 10.5 8Z" />
      <path d="M18.4 15.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z" />
    </Icon>
  )
}

/** The set drawn so far, handy for a settings preview or a style test. */
export const OWN_ICONS = {
  Send,
  MessageCircle,
  CornerUpLeft,
  Forward,
  Check,
  CheckCheck,
  Clock,
  Smile,
  Sticker,
  Paperclip,
  Mic,
  Plus,
  X,
  Search,
  Trash2,
  Pencil,
  Copy,
  Pin,
  Download,
  MoreHorizontal,
  MoreVertical,
  ArrowDown,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  UserRound,
  Users,
  Megaphone,
  Bot,
  Bell,
  BellOff,
  Eye,
  EyeOff,
  Settings,
  Heart,
  Sparkles,
}
