'use client'

import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { formatAmount } from '@/lib/utils'
import type { WishlistItem } from '@/lib/types'

interface Props {
  item: WishlistItem
  onConfirmDone: () => void
  onCancel: () => void
}

export default function WishlistCompleteDialog({ item, onConfirmDone, onCancel }: Props) {
  const router = useRouter()
  const { updateWishlistItem } = useStore()

  async function handleCreateExpense() {
    await fetch(`/api/wishlist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_done: true }),
    })
    updateWishlistItem({ ...item, is_done: true })
    const params = new URLSearchParams({
      type: 'expense',
      amount: String(item.price || ''),
      content: item.name,
    })
    router.push(`/transaction/new?${params}`)
  }

  async function handleDoneOnly() {
    await fetch(`/api/wishlist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_done: true }),
    })
    updateWishlistItem({ ...item, is_done: true })
    onConfirmDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl p-6 mx-4 max-w-sm w-full shadow-[0px_8px_24px_rgba(0,0,0,0.16)]">
        <p className="text-[16px] font-semibold text-[var(--color-text)] mb-2">
          {item.name}을(를) 구매하셨나요?
        </p>
        <p className="text-sm text-[var(--color-text-sub)] mb-6">
          지출 거래로도 기록하면 가계부에 자동 반영돼요.
          {item.price > 0 && <> ({formatAmount(item.price)}원)</>}
        </p>
        <div className="space-y-2">
          <button
            className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-white text-[15px] font-semibold"
            onClick={handleCreateExpense}
          >
            지출 거래 만들기
          </button>
          <button
            className="w-full h-12 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] text-[15px] font-medium"
            onClick={handleDoneOnly}
          >
            완료만 처리
          </button>
          <button
            className="w-full h-12 rounded-xl text-[var(--color-text-sub)] text-[15px]"
            onClick={onCancel}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
