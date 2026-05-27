'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { isLoanReceivedTransaction } from '@/lib/finance'
import type { Transaction, Category, Asset } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import CatIcon from '@/components/ui/CatIcon'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface Props {
  tx: Transaction
  categories: Category[]
  assets: Asset[]
  onDelete: (id: string) => void
  onEdit?: (tx: Transaction) => void
}

const TYPE_ICON: Record<string, string> = {
  transfer: 'swap',
  loan_repayment: 'creditCard',
  loan_received: 'creditCard',
}

export default function TransactionItem({ tx, categories, assets, onDelete, onEdit }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const category = categories.find(c => c.id === tx.category_id)
  const asset = assets.find(a => a.id === tx.asset_id)
  const fromAsset = assets.find(a => a.id === tx.from_asset_id)
  const toAsset = assets.find(a => a.id === tx.to_asset_id)

  const isLoanReceived = isLoanReceivedTransaction(tx, assets)
  let assetLabel = ''
  if (tx.type === 'income' || tx.type === 'expense' || tx.type === 'asset') {
    assetLabel = asset?.name ?? ''
  } else if (tx.type === 'transfer' || tx.type === 'loan_repayment') {
    assetLabel = [fromAsset?.name, toAsset?.name].filter(Boolean).join(' → ')
  }

  const amountColor =
    tx.type === 'income' ? 'text-[var(--color-income)]' :
    tx.type === 'expense' || tx.type === 'loan_repayment' ? 'text-[var(--color-expense)]' :
    isLoanReceived ? 'text-[var(--color-primary)]' :
    'text-[var(--color-text)]'

  const amountPrefix = tx.type === 'income' || isLoanReceived ? '+' : ''

  const iconKey = category?.icon || TYPE_ICON[isLoanReceived ? 'loan_received' : tx.type] || '💰'
  const iconId = category?.id ?? ''

  // 서브 레이블: 카테고리명 · 자산명
  const costLabel = tx.type === 'transfer' && tx.fee > 0
    ? `수수료 ${formatAmount(tx.fee)}원`
    : tx.type === 'loan_repayment' && tx.fee > 0
      ? `이자 ${formatAmount(tx.fee)}원`
      : ''
  const subLabel = [isLoanReceived ? '대출 수령' : category?.name, assetLabel, costLabel].filter(Boolean).join(' · ')

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  function requestDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setMenuOpen(false)
    setDeleteError('')
    setDeleteConfirmOpen(true)
  }

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteError('')

    try {
      const res = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setDeleteError('삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        setDeleting(false)
        return
      }
      setDeleteConfirmOpen(false)
      onDelete(tx.id)
    } catch {
      setDeleteError('네트워크 오류가 발생했습니다.')
      setDeleting(false)
    }
  }

  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-[8px] cursor-pointer active:bg-[var(--color-surface-sub)] transition-colors"
        onClick={() => onEdit ? onEdit(tx) : router.push(`/transaction/${tx.id}`)}
      >
        {/* 카테고리 아이콘 */}
        <CatIcon icon={iconKey} id={iconId} size={36} />

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-[var(--color-text)] truncate leading-tight">{tx.content || '(내용 없음)'}</p>
          {subLabel && (
            <p className="text-[11.5px] text-[var(--color-text-sub)] mt-0.5 truncate leading-none">{subLabel}</p>
          )}
          {tx.note && (
            <p className="text-[11px] text-[var(--color-text-sub)] mt-0.5 italic truncate">{tx.note}</p>
          )}
        </div>

        {/* 금액 + 메뉴 */}
        <div className="flex items-center shrink-0">
          <div className="relative" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
              className="p-1.5 rounded-lg hover:bg-[var(--color-border)] transition-colors"
            >
              <MoreHorizontal size={15} className="text-[var(--color-text-sub)]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-50 min-w-[100px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-e3 overflow-hidden">
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit ? onEdit(tx) : router.push(`/transaction/${tx.id}`) }}
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
                  onClick={requestDelete}
                  className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-expense)] hover:bg-[var(--color-surface-sub)]"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
          <span className={`text-[14px] font-semibold tabular-nums ${amountColor}`}>
            {amountPrefix}{formatAmount(tx.amount)}원
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="거래를 삭제할까요?"
        description={(
          <>
            <span className="block font-medium text-[var(--color-text)]">{tx.content || '(내용 없음)'}</span>
            <span className="mt-1 block">{tx.date} · {formatAmount(tx.amount)}원 거래가 삭제됩니다.</span>
            {deleteError && <span className="mt-2 block font-medium text-[var(--color-expense)]">{deleteError}</span>}
          </>
        )}
        confirmLabel="삭제"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteConfirmOpen(false)}
      />
    </>
  )
}
