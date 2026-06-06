'use client'

import { useState } from 'react'
import { Pin, Pencil, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { MEMO_TEXT_DARK, MEMO_TEXT_DARK_SUB } from '@/lib/memoColors'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { Memo } from '@/lib/types'

const DAY_SHORT = ['일', '월', '화', '수', '목', '금', '토']

function dateLabel(d: string) {
  const obj = new Date(d + 'T00:00:00')
  return `${obj.getFullYear()}. ${obj.getMonth() + 1}. ${obj.getDate()}. (${DAY_SHORT[obj.getDay()]})`
}

interface Props {
  open: boolean
  onClose: () => void
  memo: Memo | null
  /** 편집 진입 — 부모가 MemoForm을 연다 */
  onEdit: () => void
}

export default function MemoDetail({ open, onClose, memo, onEdit }: Props) {
  const { deleteMemo } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!memo) return null
  const colored = !!memo.color
  const titleColor = colored ? MEMO_TEXT_DARK : 'var(--color-text)'
  const bodyColor = colored ? MEMO_TEXT_DARK_SUB : 'var(--color-text-sub)'

  async function handleDelete() {
    if (!memo) return
    setDeleting(true)
    await fetch(`/api/memos/${memo.id}`, { method: 'DELETE' })
    deleteMemo(memo.id)
    setDeleting(false)
    setConfirmDelete(false)
    onClose()
  }

  return (
    <>
      <SlideUpSheet
        open={open}
        onClose={onClose}
        title="메모"
        rightAction={
          memo.pinned ? (
            <span className="text-[var(--color-primary)]" aria-label="상단 고정됨">
              <Pin size={18} fill="currentColor" />
            </span>
          ) : undefined
        }
      >
        <div
          className="rounded-2xl px-4 py-4"
          style={{
            background: memo.color || 'var(--color-surface-sub)',
            border: colored ? 'none' : '1px solid var(--color-border)',
          }}
        >
          {memo.date && (
            <span
              className="inline-block text-[12px] font-medium px-2.5 py-1 rounded-full mb-3"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }}
            >
              {dateLabel(memo.date)}
            </span>
          )}
          {memo.title && (
            <h3 className="text-[18px] font-bold leading-snug mb-2 break-words" style={{ color: titleColor }}>
              {memo.title}
            </h3>
          )}
          {memo.content && (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: bodyColor }}>
              {memo.content}
            </p>
          )}
          {!memo.title && !memo.content && (
            <p className="text-[14px]" style={{ color: bodyColor }}>내용 없음</p>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 h-12 rounded-xl bg-[var(--color-primary)] text-white text-[15px] font-semibold flex items-center justify-center gap-1.5"
          >
            <Pencil size={16} />
            편집
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="h-12 px-4 rounded-xl border border-[var(--color-border)] text-[15px] font-medium text-[var(--color-expense)] flex items-center justify-center gap-1.5"
          >
            <Trash2 size={16} />
            삭제
          </button>
        </div>
      </SlideUpSheet>

      <ConfirmDialog
        open={confirmDelete}
        title="이 메모를 삭제할까요?"
        description="삭제한 메모는 복구할 수 없어요."
        confirmLabel="삭제"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}
