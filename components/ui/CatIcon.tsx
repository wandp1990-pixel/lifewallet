import type { ReactNode } from 'react'
import { categoryColor } from '@/lib/colors'

export type IconKey =
  | 'food' | 'car' | 'home2' | 'bulb' | 'phone' | 'cart' | 'tv'
  | 'gamepad' | 'shirt' | 'pill' | 'gift' | 'heart' | 'box'
  | 'book' | 'smile' | 'wallet' | 'chart' | 'arrowDown' | 'sparkle'
  | 'stethoscope' | 'bag' | 'coffee' | 'swap' | 'creditCard'

export const ICON_KEYS: IconKey[] = [
  'food', 'car', 'home2', 'bulb', 'phone', 'cart', 'tv', 'gamepad',
  'shirt', 'pill', 'gift', 'heart', 'box', 'book', 'smile', 'wallet',
  'chart', 'arrowDown', 'sparkle', 'stethoscope', 'bag', 'coffee', 'swap', 'creditCard',
]

export const ICON_LABELS: Record<IconKey, string> = {
  food: '식비', car: '교통', home2: '주거', bulb: '공과금',
  phone: '통신', cart: '생필품', tv: '구독', gamepad: '취미',
  shirt: '의류', pill: '건강', gift: '선물', heart: '의료',
  box: '기타', book: '교육', smile: '문화', wallet: '지갑',
  chart: '투자', arrowDown: '수입', sparkle: '보너스',
  stethoscope: '진료', bag: '쇼핑', coffee: '카페', swap: '이체', creditCard: '대출',
}

const PATHS: Record<IconKey, ReactNode> = {
  food: (
    <>
      <path d="M3 11h18" />
      <path d="M3 11a9 9 0 0018 0" />
      <path d="M9 4v3M12 4v3M15 4v3" />
    </>
  ),
  car: (
    <>
      <path d="M5 11l1.5-4a2 2 0 011.9-1.4h7.2a2 2 0 011.9 1.4L19 11" />
      <rect x="3" y="11" width="18" height="6" rx="1.5" />
      <circle cx="7.5" cy="17" r="1.8" />
      <circle cx="16.5" cy="17" r="1.8" />
    </>
  ),
  home2: <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-3v-7H8v7H5a2 2 0 01-2-2v-9z" />,
  bulb: (
    <path d="M9 18h6M10 21h4M12 3a7 7 0 014 13c-.6.4-1 1-1 2v0H9v0c0-1-.4-1.6-1-2a7 7 0 014-13z" />
  ),
  phone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
  ),
  cart: (
    <>
      <path d="M3 4h2l2.5 13H19l2-9H6" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  tv: (
    <>
      <rect x="2" y="7" width="20" height="13" rx="2" />
      <path d="M8 3l4 4 4-4" />
    </>
  ),
  gamepad: (
    <>
      <rect x="2" y="8" width="20" height="11" rx="4" />
      <path d="M6.5 12v3M5 13.5h3" />
      <circle cx="15.5" cy="13" r="0.9" />
      <circle cx="18.5" cy="14" r="0.9" />
    </>
  ),
  shirt: (
    <path d="M6 5l3-2h6l3 2 3 3-3 3-1-.5V20a1 1 0 01-1 1H9a1 1 0 01-1-1v-9.5L7 11l-3-3z" />
  ),
  pill: (
    <>
      <path d="M4 10a4.2 4.2 0 016-6l10 10a4.2 4.2 0 01-6 6z" />
      <line x1="9" y1="15" x2="15" y2="9" />
    </>
  ),
  gift: (
    <>
      <path d="M4 12v8a1 1 0 001 1h14a1 1 0 001-1v-8" />
      <rect x="2" y="8" width="20" height="4" rx="1" />
      <path d="M12 8v13M12 8c-1.5-3-4-3-4-1.5S10 8 12 8M12 8c1.5-3 4-3 4-1.5S14 8 12 8" />
    </>
  ),
  heart: (
    <path d="M12 21s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z" />
  ),
  box: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </>
  ),
  book: (
    <>
      <path d="M4 4h6a4 4 0 014 4v12a3 3 0 00-3-3H4V4z" />
      <path d="M20 4h-6a4 4 0 00-4 4v12a3 3 0 013-3h7V4z" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 10h.01M15 10h.01" />
    </>
  ),
  wallet: (
    <path d="M3 7h15a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l1-3h12l1 3M16 13h3" />
  ),
  chart: <path d="M3 3v18h18M7 14l4-4 3 3 5-6" />,
  arrowDown: <path d="M12 5v14M5 12l7 7 7-7" />,
  sparkle: (
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  ),
  stethoscope: (
    <>
      <path d="M5 3v6a4 4 0 008 0V3M9 3v6" />
      <path d="M9 13a4 4 0 008 0v-2" />
      <circle cx="17" cy="13" r="2" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 8V5a3 3 0 016 0v3" />
    </>
  ),
  coffee: (
    <>
      <path d="M3 8h14v5a5 5 0 01-5 5H8a5 5 0 01-5-5V8z" />
      <path d="M17 9h2a3 3 0 010 6h-2M6 2v3M10 2v3M14 2v3" />
    </>
  ),
  swap: (
    <>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </>
  ),
  creditCard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
}

function SvgIcon({ name, size, color }: { name: IconKey; size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}

function isIconKey(value: string): value is IconKey {
  return value in PATHS
}

interface CatIconProps {
  icon: string
  id: string
  size?: number
  color?: string
}

export default function CatIcon({ icon, id, size = 36, color }: CatIconProps) {
  const hexColor = id ? categoryColor(id) : null
  const resolvedColor = color ?? (hexColor && hexColor.startsWith('#') ? hexColor : 'var(--color-text-sub)')
  const bg = hexColor && hexColor.startsWith('#') ? hexColor + '26' : 'var(--color-surface-sub)'
  const radius = Math.round(size * 0.3)
  const innerSize = Math.round(size * 0.55)

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {isIconKey(icon)
        ? <SvgIcon name={icon} size={innerSize} color={resolvedColor} />
        : <span style={{ fontSize: innerSize, lineHeight: 1 }}>{icon || '📦'}</span>
      }
    </span>
  )
}
