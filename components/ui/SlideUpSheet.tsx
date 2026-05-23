'use client'

import { useEffect, type ReactNode } from 'react'

interface SlideUpSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  rightAction?: ReactNode
}

export default function SlideUpSheet({ open, onClose, title, children, rightAction }: SlideUpSheetProps) {
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex touch-none items-end justify-center md:items-center">
      <div
        className="tds-fade-in absolute inset-0 bg-[rgba(2,9,19,0.5)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="tds-slide-up relative flex max-h-[90vh] w-full touch-pan-y flex-col rounded-t-2xl bg-[var(--color-surface)] shadow-[0px_8px_24px_rgba(0,0,0,0.16)] md:max-w-[480px] md:rounded-2xl"
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
