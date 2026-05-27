'use client'

import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, loading, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="tds-fade-in fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(2,9,19,0.5)] px-4"
      onClick={() => {
        if (!loading) onClose()
      }}
    >
      <div
        className="tds-slide-up w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-5 shadow-[var(--shadow-e4)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-expense-subtle)]">
            <Trash2 size={19} className="text-[var(--color-expense)]" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="text-[16px] font-semibold leading-6 text-[var(--color-text)]">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-[14px] leading-5 text-[var(--color-text-body)]">
                {description}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="h-12 flex-1 rounded-xl border border-[var(--color-border)] text-[15px] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-sub)] disabled:opacity-50"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="h-12 flex-1 rounded-xl bg-[var(--color-expense)] text-[15px] font-semibold text-white transition-opacity disabled:opacity-50"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '삭제 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
