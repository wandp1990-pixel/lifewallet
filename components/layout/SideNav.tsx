'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DESKTOP_NAV, NAV_ITEMS } from '@/lib/nav-config'

function isActive(pathname: string, href: string, matchMode: 'exact' | 'startsWith' = 'startsWith') {
  return matchMode === 'exact' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
}

export default function SideNav() {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full py-4 px-3 gap-6">
      <div className="px-2 py-2 text-lg font-bold text-[var(--color-text)]">LifeWallet</div>

      {DESKTOP_NAV.map(({ group, items }) => (
        <div key={group}>
          <p className="text-[11px] font-semibold text-[var(--color-text-sub)] uppercase tracking-wider px-2 mb-1">
            {group}
          </p>
          <ul className="space-y-0.5">
            {items.map(id => {
              const item = NAV_ITEMS[id]
              const active = isActive(pathname, item.href, item.matchMode)
              return (
                <li key={id}>
                  <Link
                    href={item.href}
                    className={[
                      'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                        : 'text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]',
                    ].join(' ')}
                  >
                    {item.icon(active, 'desktop')}
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
