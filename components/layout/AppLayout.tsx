'use client'

import type { ReactNode } from 'react'
import SideNav from './SideNav'
import BottomNav from './BottomNav'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      {/* PC 사이드바 — md 이상에서만 표시 */}
      <aside className="hidden md:flex md:flex-col md:w-[240px] md:shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <SideNav />
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto pb-[60px] md:pb-0">
        {children}
      </main>

      {/* 모바일 바텀 네비 — md 미만에서만 표시 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <BottomNav />
      </nav>
    </div>
  )
}
