'use client'

import type { Transaction, Category, Asset } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import TransactionItem from './TransactionItem'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  assets: Asset[]
  onDelete: (id: string) => void
}

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

function getDayFlow(txs: Transaction[]): number {
  return txs.reduce((sum, t) => {
    if (t.type === 'income') return sum + t.amount
    if (t.type === 'expense' || t.type === 'loan_repayment') return sum - t.amount
    return sum
  }, 0)
}

export default function ListTab({ transactions, categories, assets, onDelete }: Props) {
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
    <div>
      {dates.map(date => {
        const dayTxs = grouped[date]
        const flow = getDayFlow(dayTxs)
        const [y, m, d] = date.split('-').map(Number)
        const dateObj = new Date(y, m - 1, d)
        const dow = dateObj.getDay()
        const dayName = DAY_NAMES[dow]
        const isSunday = dow === 0
        const isSaturday = dow === 6

        return (
          <div key={date}>
            {/* 날짜 헤더 */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-bg)]">
              <span className={`text-[24px] font-bold leading-none ${isSunday ? 'text-[var(--color-expense)]' : isSaturday ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>
                {d}
              </span>
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
                isSunday
                  ? 'bg-[#fff0f1] text-[var(--color-expense)]'
                  : isSaturday
                  ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
                  : 'bg-[var(--color-surface-sub)] text-[var(--color-text-sub)]'
              }`}>
                {dayName}
              </span>
              <div className="flex-1" />
              <span className={`text-[13px] font-semibold tabular-nums ${flow >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
                {flow > 0 ? '+' : ''}{formatAmount(Math.abs(flow))}원
              </span>
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
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
