'use client'

import { useState, useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'

/**
 * 다크모드 토글 버튼.
 * - 초기 테마(첫 방문 시 OS 설정 추종 + localStorage 우선)는 layout.tsx의 inline 스크립트가
 *   페인트 전에 <html>에 `dark` 클래스로 적용한다 (FOUC 방지). 여기서는 현재 상태를 읽어 표시만 동기화.
 * - 토글 시 <html> 클래스 + localStorage('theme')를 함께 갱신.
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      /* localStorage 접근 불가(프라이빗 모드 등) — 세션 내 토글만 반영 */
    }
  }

  return (
    <button
      onClick={toggle}
      className="p-2 -mr-2 rounded-xl hover:bg-[var(--color-surface-sub)] transition-colors"
      title={dark ? '라이트 모드' : '다크 모드'}
      aria-label="테마 전환"
    >
      {dark
        ? <Sun size={18} className="text-[var(--color-text-sub)]" />
        : <Moon size={18} className="text-[var(--color-text-sub)]" />}
    </button>
  )
}
