'use client'

import type { Transaction, Category, Asset } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import TransactionItem from './TransactionItem'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  assets: Asset[]
  onDelete: (id: string) => void
  onEdit?: (tx: Transaction) => void
}

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

export default function ListTab({ transactions, categories, assets, onDelete, onEdit }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-[15px]">거래 내역이 없습니다</p>
        <p className="text-sm mt-1">+ 추가를 눌러 기록해 보세요</p>
      </div>
    )
  }

  const grouped: Record<string, Transaction[]> = {}
  for (const t of transactions) {
    if (!grouped[t.date]) grouped[t.date] = []
    grouped[t.date].push(t)
  }
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="bg-[var(--color-surface-sub)] min-h-full pb-4">
      {dates.map(date => {
        const dayTxs = grouped[date]
        const dayIncome = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const dayExpense = dayTxs.filter(t => t.type === 'expense' || t.type === 'loan_repayment').reduce((s, t) => s + t.amount, 0)
        const [y, m, d] = date.split('-').map(Number)
        const dateObj = new Date(y, m - 1, d)
        const dow = dateObj.getDay()
        const badgeBg = dow === 0 ? 'var(--color-expense)' : dow === 6 ? 'var(--color-primary)' : '#8b95a1'

        return (
          <div key={date} className="mb-2">
            {/* 날짜 헤더 */}
            <div className="flex items-center justify-between px-4 py-[10px] bg-[var(--color-surface)] border-b border-[var(--color-border)]">
              <div className="flex items-center gap-1.5">
                <span className="text-[18px] font-bold tabular-nums leading-none text-[var(--color-text)]">
                  {d}
                </span>
                <span
                  className="text-[10px] font-semibold px-[7px] py-[2px] rounded text-white leading-tight"
                  style={{ background: badgeBg }}
                >
                  {DAY_NAMES[dow]}
                </span>
              </div>
              <div className="flex text-[12px] tabular-nums shrink-0">
                <span className="w-[76px] text-right text-[var(--color-income)]">
                  {dayIncome > 0 ? `${formatAmount(dayIncome)}원` : ''}
                </span>
                <span className="w-[76px] text-right text-[var(--color-expense)]">
                  {dayExpense > 0 ? `${formatAmount(dayExpense)}원` : ''}
                </span>
              </div>
            </div>

            {/* 거래 목록 */}
            <div className="bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {dayTxs.map(tx => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  categories={categories}
                  assets={assets}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
