'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MOBILE_NAV, NAV_ITEMS } from '@/lib/nav-config'

function isActive(pathname: string, href: string, matchMode: 'exact' | 'startsWith' = 'startsWith') {
  return matchMode === 'exact' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
}

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <div className="flex h-[60px] px-2">
      {MOBILE_NAV.map(id => {
        const item = NAV_ITEMS[id]
        const active = isActive(pathname, item.href, item.matchMode)
        return (
          <Link
            key={id}
            href={item.href}
            className={[
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-sub)]',
            ].join(' ')}
          >
            {item.icon(active, 'mobile')}
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
