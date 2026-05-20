'use client'

import { useState } from 'react'
import { MoreHorizontal, Trash2, Pencil, Check } from 'lucide-react'
import { useStore } from '@/lib/store'
import { formatAmount } from '@/lib/utils'
import WishlistCompleteDialog from './WishlistCompleteDialog'
import type { WishlistItem } from '@/lib/types'

const PRIORITY_LABELS = { 1: '높음', 2: '보통', 3: '낮음' }
const PRIORITY_COLORS = { 1: 'text-[var(--color-expense)]', 2: 'text-[var(--color-warning)]', 3: 'text-[var(--color-text-sub)]' }

interface Props {
  item: WishlistItem
  onEdit: (item: WishlistItem) => void
}

export default function WishlistItemRow({ item, onEdit }: Props) {
  const { updateWishlistItem, deleteWishlistItem } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [completeDialog, setCompleteDialog] = useState(false)

  function handleToggle() {
    if (!item.is_done) {
      setCompleteDialog(true)
    } else {
      fetch(`/api/wishlist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_done: false }),
      })
      updateWishlistItem({ ...item, is_done: false })
    }
  }

  async function handleDelete() {
    await fetch(`/api/wishlist/${item.id}`, { method: 'DELETE' })
    deleteWishlistItem(item.id)
  }

  return (
    <>
      <div className={`flex items-center gap-3 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl ${item.is_done ? 'opacity-60' : ''}`}>
        {/* 완료 토글 */}
        <button
          onClick={handleToggle}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.is_done ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'border-[var(--color-border-strong)]'}`}
        >
          {item.is_done && <Check size={13} className="text-white" strokeWidth={3} />}
        </button>

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-[15px] font-medium text-[var(--color-text)] ${item.is_done ? 'line-through text-[var(--color-text-sub)]' : ''}`}>
              {item.name}
            </p>
            <span className="text-xs text-[var(--color-text-sub)] bg-[var(--color-surface-sub)] px-1.5 py-0.5 rounded-full">
              {item.type === 'wish' ? '위시' : '경조사'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {item.price > 0 && (
              <span className="text-sm font-semibold text-[var(--color-text-body)] tabular-nums">{formatAmount(item.price)}원</span>
            )}
            <span className={`text-xs font-medium ${PRIORITY_COLORS[item.priority]}`}>{PRIORITY_LABELS[item.priority]}</span>
            {item.target_date && (
              <span className="text-xs text-[var(--color-text-sub)]">{item.target_date}</span>
            )}
          </div>
        </div>

        {/* 더보기 메뉴 */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)] text-[var(--color-text-sub)]"
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0px_4px_12px_rgba(0,0,0,0.12)] overflow-hidden min-w-[120px]">
                <button
                  className="flex items-center gap-2 w-full px-4 py-3 text-[14px] text-[var(--color-text)] hover:bg-[var(--color-surface-sub)]"
                  onClick={() => { setMenuOpen(false); onEdit(item) }}
                >
                  <Pencil size={14} /> 수정
                </button>
                <button
                  className="flex items-center gap-2 w-full px-4 py-3 text-[14px] text-[var(--color-expense)] hover:bg-[var(--color-surface-sub)]"
                  onClick={() => { setMenuOpen(false); setConfirming(true) }}
                >
                  <Trash2 size={14} /> 삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--color-surface)] rounded-2xl p-6 mx-4 max-w-sm w-full shadow-[0px_8px_24px_rgba(0,0,0,0.16)]">
            <p className="text-[16px] font-semibold text-[var(--color-text)] mb-2">항목을 삭제할까요?</p>
            <p className="text-sm text-[var(--color-text-sub)] mb-6">"{item.name}"이(가) 삭제됩니다.</p>
            <div className="flex gap-3">
              <button
                className="flex-1 h-12 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] text-[15px] font-medium"
                onClick={() => setConfirming(false)}
              >취소</button>
              <button
                className="flex-1 h-12 rounded-xl bg-[var(--color-expense)] text-white text-[15px] font-semibold"
                onClick={handleDelete}
              >삭제</button>
            </div>
          </div>
        </div>
      )}

      {completeDialog && (
        <WishlistCompleteDialog
          item={item}
          onConfirmDone={() => setCompleteDialog(false)}
          onCancel={() => setCompleteDialog(false)}
        />
      )}
    </>
  )
}
