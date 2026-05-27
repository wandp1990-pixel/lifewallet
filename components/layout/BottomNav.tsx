'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MOBILE_NAV, NAV_ITEMS, type NavId } from '@/lib/nav-config'

const MORE_PATHS = ['/settings', '/dashboard', '/report', '/savings', '/wishlist']

function isActive(pathname: string, href: string, matchMode: 'exact' | 'startsWith') {
  return matchMode === 'exact' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
}

function getMobileLabel(id: NavId) {
  if (id === 'daily') return '내역'
  if (id === 'settings') return '더보기'
  return NAV_ITEMS[id].label
}

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <>
      <div className="flex h-[60px] px-2">
        {MOBILE_NAV.map(id => {
          const item = NAV_ITEMS[id]
          const active = id === 'settings'
            ? MORE_PATHS.some(path => isActive(pathname, path, 'startsWith'))
            : isActive(pathname, item.href, item.matchMode ?? 'startsWith')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-sub)]',
              ].join(' ')}
            >
              {item.icon(active, 'mobile')}
              {getMobileLabel(id)}
            </Link>
          )
        })}
      </div>
      {/* iPhone 홈 인디케이터 safe area 확보 */}
      <div style={{ height: 'var(--safe-area-bottom)' }} />
    </>
  )
}
