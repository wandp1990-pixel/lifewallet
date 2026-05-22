'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, Layers, MoreHorizontal, Home } from 'lucide-react'

const now = new Date()
const todayLabel = `${now.getMonth() + 1}. ${String(now.getDate()).padStart(2, '0')}.`

const NAV = [
  {
    href: '/',
    label: todayLabel,
    icon: (active: boolean) => <Home size={22} strokeWidth={active ? 2.5 : 1.8} />,
    matchMode: 'exact' as const,
  },
  {
    href: '/statistics',
    label: '통계',
    icon: (active: boolean) => <BarChart2 size={22} strokeWidth={active ? 2.5 : 1.8} />,
    matchMode: 'startsWith' as const,
  },
  {
    href: '/assets',
    label: '자산',
    icon: (active: boolean) => <Layers size={22} strokeWidth={active ? 2.5 : 1.8} />,
    matchMode: 'startsWith' as const,
  },
  {
    href: '/settings',
    label: '더보기',
    icon: (active: boolean) => <MoreHorizontal size={22} strokeWidth={active ? 2.5 : 1.8} />,
    matchMode: 'startsWith' as const,
  },
]

function isActive(pathname: string, href: string, matchMode: 'exact' | 'startsWith') {
  return matchMode === 'exact' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
}

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <>
      <div className="flex h-[60px] px-2">
        {NAV.map(item => {
          const active = isActive(pathname, item.href, item.matchMode)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-sub)]',
              ].join(' ')}
            >
              {item.icon(active)}
              {item.label}
            </Link>
          )
        })}
      </div>
      {/* iPhone 홈 인디케이터 safe area 확보 */}
      <div style={{ height: 'var(--safe-area-bottom)' }} />
    </>
  )
}
