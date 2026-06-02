'use client'

import type { Transaction, Category, Asset } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import { getOutflowAmount } from '@/lib/finance'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import TransactionItem from './TransactionItem'

interface Props {
  /** 선택 날짜 'YYYY-MM-DD'. null이면 시트 닫힘 */
  date: string | null
  /** 해당 날짜로 이미 필터된 거래 목록 */
  transactions: Transaction[]
  categories: Category[]
  assets: Asset[]
  onClose: () => void
  /** "이 날 거래 추가" — 선택 날짜를 프리셋해 추가 시트 열기 */
  onAdd: (date: string) => void
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => void
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export default function DayDetailSheet({ date, transactions, categories, assets, onClose, onAdd, onEdit, onDelete }: Props) {
  if (!date) return null

  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  const title = `${m}월 ${d}일 (${DAY_NAMES[dow]})`

  const dayIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const dayExpense = getOutflowAmount(transactions)

  return (
    <SlideUpSheet
      open={!!date}
      onClose={onClose}
      title={title}
      rightAction={
        <button
          type="button"
          onClick={() => onAdd(date)}
          className="text-sm font-semibold text-[var(--color-primary)] px-2 py-1"
        >
          + 추가
        </button>
      }
    >
      {/* 그 날 수입/지출 합계 */}
      <div className="flex items-center justify-end gap-4 pb-3 text-[13px] tabular-nums">
        {dayIncome > 0 && (
          <span className="text-[var(--color-income)]">+{formatAmount(dayIncome)}원</span>
        )}
        {dayExpense > 0 && (
          <span className="text-[var(--color-expense)]">-{formatAmount(dayExpense)}원</span>
        )}
        {dayIncome === 0 && dayExpense === 0 && (
          <span className="text-[var(--color-text-sub)]">거래 없음</span>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-[var(--color-text-sub)]">
          <p className="text-[15px]">이 날 거래가 없습니다</p>
          <p className="text-sm mt-1">+ 추가를 눌러 기록해 보세요</p>
        </div>
      ) : (
        <div className="-mx-5 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
          {transactions.map(tx => (
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
    </SlideUpSheet>
  )
}
