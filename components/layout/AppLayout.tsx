'use client'

import type { ReactNode } from 'react'
import SideNav from './SideNav'
import BottomNav from './BottomNav'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      {/* PC 사이드바 — md 이상에서만 표시 */}
      <aside className="hidden md:flex md:flex-col md:w-[240px] md:shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <SideNav />
      </aside>

      {/* 모바일: 세로 컬럼(콘텐츠 + 바텀 네비) / PC: 메인 영역 */}
      <div className="flex flex-1 min-w-0 flex-col">
        {/* main: overflow-hidden → 스크롤 불가, rubber-band 원천 차단 */}
        {/* pt: safe-area-inset-top + bg-surface → 상태바 영역 흰색 통일 */}
        <main
          className="flex-1 min-h-0 overflow-hidden bg-[var(--color-surface)]"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* 실제 스크롤 컨테이너 — 설정 등 자체 스크롤 없는 페이지의 폴백 */}
          <div
            className="h-full overflow-y-auto"
            style={{ overscrollBehavior: 'none' }}
          >
            {children}
          </div>
        </main>

        {/* 모바일 바텀 네비 — flex shrink-0(fixed 아님). 캡슐 스타일은 BottomNav가 소유.
            main이 실제로 줄어들어 콘텐츠와 겹치지 않으므로 main에 pb 보정 불필요.
            래퍼 배경은 --color-bg(회색): 순백 캡슐이 대비로 떠 보이게 (LifeQuest "회색 위 흰 카드" 부유 원리). */}
        <div className="md:hidden shrink-0 bg-[var(--color-bg)]">
          <BottomNav />
        </div>
      </div>
    </div>
  )
}
