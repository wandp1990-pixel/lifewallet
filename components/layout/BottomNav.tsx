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
      className="w-full max-w-full overflow-hidden px-3"
      style={{
        paddingTop: 'var(--bottom-nav-gap-top)',
        // LifeQuest와 동일: 아래 여백 = max(최소 여백, 홈 인디케이터 safe area) — 합산 아님
        paddingBottom: 'max(var(--bottom-nav-gap-bottom), var(--safe-area-bottom))',
      }}
    >
      {/* 떠 있는 캡슐 바 — LifeQuest BottomNav와 동일 구조(레이아웃·높이·그림자·배경칩·점).
          색만 단일 primary로 치환(LifeQuest는 탭별 색). */}
      <div className="flex h-[var(--bottom-nav-bar)] w-full min-w-0 items-center rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 shadow-[0_12px_34px_rgba(31,41,55,0.16)]">
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
                'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 text-[11px] font-bold transition-all duration-200',
                active
                  ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shadow-sm'
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
