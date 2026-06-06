'use client'

import { Pin } from 'lucide-react'
import type { Transaction, Category, Asset, Memo } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import { getOutflowAmount } from '@/lib/finance'
import TransactionItem from './TransactionItem'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  assets: Asset[]
  memos?: Memo[]
  onDelete: (id: string) => void
  onEdit?: (tx: Transaction) => void
  onSelectMemo?: (memo: Memo) => void
}

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

export default function ListTab({ transactions, categories, assets, memos = [], onDelete, onEdit, onSelectMemo }: Props) {
  if (transactions.length === 0 && memos.length === 0) {
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
  const memosByDate: Record<string, Memo[]> = {}
  for (const m of memos) {
    if (!m.date) continue
    if (!memosByDate[m.date]) memosByDate[m.date] = []
    memosByDate[m.date].push(m)
  }
  const dates = Array.from(new Set([...Object.keys(grouped), ...Object.keys(memosByDate)]))
    .sort((a, b) => b.localeCompare(a))

  return (
    <div className="bg-[var(--color-surface-sub)] min-h-full pb-[var(--fab-clearance)] md:pb-4">
      {dates.map(date => {
        const dayTxs = grouped[date] ?? []
        const dayMemos = (memosByDate[date] ?? []).sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || a.created_at.localeCompare(b.created_at)
        )
        const dayIncome = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const dayExpense = getOutflowAmount(dayTxs)
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

            {/* 날짜 메모 */}
            {dayMemos.map(memo => (
              <button
                key={memo.id}
                onClick={() => onSelectMemo?.(memo)}
                className="flex w-full items-center gap-2 px-4 py-1 text-left bg-[var(--color-surface)] border-b border-[var(--color-border)] active:bg-[var(--color-surface-sub)] transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: memo.color || 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                />
                <span className="flex-1 min-w-0 truncate text-[12px] leading-tight text-[var(--color-text-sub)]">
                  {memo.title || memo.content || '-'}
                </span>
                {memo.pinned && <Pin size={10} className="shrink-0 text-[var(--color-primary)]" fill="currentColor" />}
              </button>
            ))}

            {/* 거래 목록 */}
            {dayTxs.length > 0 && (
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
            )}
          </div>
        )
      })}
    </div>
  )
}
