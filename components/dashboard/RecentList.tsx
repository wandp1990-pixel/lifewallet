'use client'

import Link from 'next/link'
import { isLoanReceivedTransaction } from '@/lib/finance'
import { formatAmount } from '@/lib/utils'
import { categoryColor } from '@/lib/colors'
import CatIcon from '@/components/ui/CatIcon'
import type { Transaction, Category, Asset } from '@/lib/types'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  assets: Asset[]
}

export default function RecentList({ transactions, categories, assets }: Props) {
  const recent = [...transactions]
    .filter(t => t.type !== 'asset')
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 6)

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-semibold text-[var(--color-text)]">최근 내역 <span className="text-xs font-normal text-[var(--color-text-sub)]">최근 6건</span></p>
        <Link href="/" className="text-xs text-[var(--color-primary)]">전체 보기 →</Link>
      </div>
      {recent.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[var(--color-text-sub)]">내역이 없습니다</div>
      ) : (
        recent.map(tx => {
          const isLoanReceived = isLoanReceivedTransaction(tx, assets)
          const cat = categories.find(c => c.id === tx.category_id)
          const asset = assets.find(a => a.id === tx.asset_id)
          const fromAsset = assets.find(a => a.id === tx.from_asset_id)
          const toAsset = assets.find(a => a.id === tx.to_asset_id)
          const assetLabel = tx.type === 'income' || tx.type === 'expense'
            ? asset?.name
            : [fromAsset?.name, toAsset?.name].filter(Boolean).join(' → ')
          const costLabel = tx.type === 'transfer' && tx.fee > 0
            ? `수수료 ${formatAmount(tx.fee)}원`
            : tx.type === 'loan_repayment' && tx.fee > 0
              ? `이자 ${formatAmount(tx.fee)}원`
              : ''
          const isIncome = tx.type === 'income'
          const isExpense = tx.type === 'expense' || tx.type === 'loan_repayment'
          const amountColor = isIncome
            ? 'text-[var(--color-income)]'
            : isExpense
              ? 'text-[var(--color-expense)]'
              : isLoanReceived
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-body)]'
          const sign = isIncome || isLoanReceived ? '+' : isExpense ? '-' : ''
          const d = new Date(tx.date)
          const dateStr = `${d.getMonth() + 1}.${d.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`

          return (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] last:border-b-0">
              {cat ? (
                <CatIcon icon={cat.icon || 'box'} id={cat.id} size={32} />
              ) : (
                <div className="w-8 h-8 rounded-[9px] bg-[var(--color-surface-sub)] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-text)] truncate">{tx.content || (isLoanReceived ? '대출 수령' : tx.type === 'transfer' ? '이체' : tx.type)}</p>
                <p className="text-xs text-[var(--color-text-sub)]">{[dateStr, assetLabel, costLabel].filter(Boolean).join(' · ')}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${amountColor}`}>
                {sign}{formatAmount(tx.amount)}원
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}
