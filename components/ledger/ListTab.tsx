'use client'

import type { Transaction, Category, Asset } from '@/lib/types'
import TransactionItem from './TransactionItem'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  assets: Asset[]
  onDelete: (id: string) => void
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function formatGroupDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${m}월 ${d}일 (${DAY_NAMES[date.getDay()]})`
}

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

  // 날짜별 그룹핑
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
        return (
          <div key={date}>
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-sub)]">
              <span className="text-[13px] font-medium text-[var(--color-text-sub)]">
                {formatGroupDate(date)}
              </span>
              <span className={`text-[13px] font-semibold ${flow >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
                {flow >= 0 ? '+' : ''}{new Intl.NumberFormat('ko-KR').format(flow)}원
              </span>
            </div>
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
