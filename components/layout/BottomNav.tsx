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
    <nav
      className="px-3"
      style={{
        paddingTop: 'var(--bottom-nav-gap-top)',
        // iPhone 홈 인디케이터 safe area를 캡슐 아래 여백에 합산
        paddingBottom: 'calc(var(--bottom-nav-gap-bottom) + var(--safe-area-bottom))',
      }}
    >
      {/* 떠 있는 캡슐 바 */}
      <div className="flex h-[var(--bottom-nav-bar)] items-center justify-around rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 shadow-e3">
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
                'flex min-h-[48px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[11px] font-bold transition-colors',
                active
                  ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                  : 'text-[var(--color-text-sub)]',
              ].join(' ')}
            >
              {item.icon(active, 'mobile')}
              <span>{getMobileLabel(id)}</span>
              {active && (
                <span className="h-1 w-1 rounded-full bg-[var(--color-primary)]" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
