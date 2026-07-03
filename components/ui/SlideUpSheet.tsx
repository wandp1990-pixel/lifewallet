'use client'

import { useEffect, useState, type ReactNode } from 'react'

interface SlideUpSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  rightAction?: ReactNode
}

export default function SlideUpSheet({ open, onClose, title, children, rightAction }: SlideUpSheetProps) {
  // 모바일 키보드가 올라온 만큼 시트를 위로 밀어 하단(저장 버튼 등)이 가려지지 않게 한다.
  // 키보드는 레이아웃 뷰포트를 줄이지 않으므로(특히 iOS Safari) visualViewport로 실제 보이는 영역을 잰다.
  const [kb, setKb] = useState<{ inset: number; availH: number | null }>({ inset: 0, availH: null })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // 8px 미만은 브라우저 UI 오차로 보고 무시(키보드로 간주하지 않음)
      const active = inset > 8
      setKb({ inset: active ? inset : 0, availH: active ? vv.height : null })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setKb({ inset: 0, availH: null })
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex touch-none items-end justify-center md:items-center"
      style={{ paddingBottom: kb.inset }}
    >
      <div
        className="tds-fade-in absolute inset-0 bg-[rgba(2,9,19,0.5)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="tds-slide-up relative flex w-full touch-pan-y flex-col rounded-t-2xl bg-[var(--color-surface)] shadow-[0px_8px_24px_rgba(0,0,0,0.16)] md:max-w-[480px] md:rounded-2xl"
        style={{ maxHeight: kb.availH != null ? `${kb.availH - 12}px` : '90vh' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex touch-none items-center justify-between border-b border-[var(--color-border)] px-5 pb-3 pt-5">
          <h2 className="text-lg font-bold text-[var(--color-text)]">{title}</h2>
          <div className="flex items-center gap-2">
            {rightAction}
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--color-text-body)] px-2 py-1"
              aria-label="닫기"
            >
              닫기
            </button>
          </div>
        </header>
        <div className="overflow-y-auto overscroll-contain px-5 py-4 touch-pan-y">{children}</div>
      </div>
    </div>
  )
}
