'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import type { Transaction, Category, Asset } from '@/lib/types'
import { formatAmount } from '@/lib/utils'

interface Props {
  tx: Transaction
  categories: Category[]
  assets: Asset[]
  onDelete: (id: string) => void
}

export default function TransactionItem({ tx, categories, assets, onDelete }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const category = categories.find(c => c.id === tx.category_id)
  const asset = assets.find(a => a.id === tx.asset_id)
  const fromAsset = assets.find(a => a.id === tx.from_asset_id)
  const toAsset = assets.find(a => a.id === tx.to_asset_id)

  let assetLabel = ''
  if (tx.type === 'income' || tx.type === 'expense' || tx.type === 'asset') {
    assetLabel = asset?.name ?? ''
  } else if (tx.type === 'transfer' || tx.type === 'loan_repayment') {
    assetLabel = [fromAsset?.name, toAsset?.name].filter(Boolean).join(' → ')
  }

  const amountColor =
    tx.type === 'income' ? 'text-[var(--color-income)]' :
    tx.type === 'expense' || tx.type === 'loan_repayment' ? 'text-[var(--color-expense)]' :
    'text-[var(--color-text)]'

  const amountPrefix =
    tx.type === 'income' ? '+' :
    tx.type === 'expense' || tx.type === 'loan_repayment' ? '-' : ''

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setMenuOpen(false)
    if (!confirm('거래를 삭제하시겠습니까?')) return
    await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' })
    onDelete(tx.id)
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-surface-sub)] transition-colors"
      onClick={() => router.push(`/transaction/${tx.id}`)}
    >
      <div className="flex-1 min-w-0">
        {(category?.name || category?.icon) && (
          <p className="text-xs text-[var(--color-text-sub)] mb-0.5">
            {category.icon} {category.name}
          </p>
        )}
        <p className="text-[15px] text-[var(--color-text)] truncate">{tx.content || '(내용 없음)'}</p>
        {assetLabel && (
          <p className="text-xs text-[var(--color-text-sub)] mt-0.5">{assetLabel}</p>
        )}
        {tx.note && (
          <p className="text-xs text-[var(--color-text-sub)] mt-0.5 italic truncate">{tx.note}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className={`text-[15px] font-semibold ${amountColor}`}>
          {amountPrefix}{formatAmount(tx.amount)}원
        </span>
        <div className="relative" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            className="p-1.5 rounded-lg hover:bg-[var(--color-border)] transition-colors"
          >
            <MoreHorizontal size={16} className="text-[var(--color-text-sub)]" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 min-w-[100px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden">
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(false); router.push(`/transaction/${tx.id}`) }}
                className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-sub)]"
              >
                수정
              </button>
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(false); router.push(`/transaction/new?copy=${tx.id}`) }}
                className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-sub)]"
              >
                복사
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-expense)] hover:bg-[var(--color-surface-sub)]"
              >
                삭제
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
