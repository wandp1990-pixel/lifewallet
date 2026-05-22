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
      {/* main: overflow-hidden → 스크롤 불가, rubber-band 원천 차단 */}
      {/* pt: safe-area-inset-top + bg-surface → 상태바 영역 흰색 통일 */}
      <main
        className="flex-1 overflow-hidden bg-[var(--color-surface)]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* 실제 스크롤 컨테이너 — 설정 등 자체 스크롤 없는 페이지의 폴백 */}
        <div
          className="h-full overflow-y-auto pb-[var(--bottom-nav-total)] md:pb-0"
          style={{ overscrollBehavior: 'none' }}
        >
          {children}
        </div>
      </main>

      {/* 모바일 바텀 네비 — md 미만에서만 표시 */}
      <nav className="md:hidden fixed bottom-[-10px] inset-x-0 z-50 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <BottomNav />
      </nav>
    </div>
  )
}
