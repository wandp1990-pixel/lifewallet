'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import SideNav from './SideNav'
import BottomNav from './BottomNav'

export default function AppLayout({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const viewport = window.visualViewport
    let frame = 0

    const syncHeight = () => {
      // 확대·키보드로 줄어든 영역에 맞춰 앱 전체와 하단 바를 이동시키지 않는다.
      if (document.visibilityState === 'hidden' || (viewport && viewport.scale !== 1)) return
      const active = document.activeElement
      if (active instanceof HTMLElement && (active.matches('input, textarea, select') || active.isContentEditable)) return

      // 설치형 앱의 새로고침 직후 dvh가 표시 영역보다 클 수 있으므로 실제 높이로 제한한다.
      const height = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight)
      if (height > 0) shell.style.setProperty('--app-viewport-height', `${height}px`)
    }
    const scheduleSync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncHeight)
    }

    syncHeight()
    window.addEventListener('resize', scheduleSync)
    window.addEventListener('pageshow', scheduleSync)
    viewport?.addEventListener('resize', scheduleSync)
    document.addEventListener('visibilitychange', scheduleSync)
    document.addEventListener('focusout', scheduleSync)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleSync)
      window.removeEventListener('pageshow', scheduleSync)
      viewport?.removeEventListener('resize', scheduleSync)
      document.removeEventListener('visibilitychange', scheduleSync)
      document.removeEventListener('focusout', scheduleSync)
    }
  }, [])

  // html/body는 스크롤을 잠그고, 표시 영역에 맞춘 셸 내부에서만 스크롤한다.
  return (
    <div
      ref={shellRef}
      className="flex h-dvh overflow-hidden"
      style={{ height: 'min(100dvh, var(--app-viewport-height, 100dvh))' }}
    >
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
