'use client'

import type { Transaction } from '@/lib/types'
import { formatAmount, cn } from '@/lib/utils'

interface Props {
  year: number
  month: number
  transactions: Transaction[]
  onSelectDate: (date: string) => void
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function CalendarTab({ year, month, transactions, onSelectDate }: Props) {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const lastDate = new Date(year, month, 0).getDate()

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // 날짜별 수입/지출 집계 (asset 타입 제외)
  const dailyMap: Record<string, { income: number; expense: number }> = {}
  for (const t of transactions) {
    if (t.type === 'asset') continue
    if (!dailyMap[t.date]) dailyMap[t.date] = { income: 0, expense: 0 }
    if (t.type === 'income') dailyMap[t.date].income += t.amount
    if (t.type === 'expense') dailyMap[t.date].expense += t.amount
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: lastDate }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function toDateStr(day: number) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return (
    <div className="px-2 py-2">
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs text-[var(--color-text-sub)] py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-[var(--color-border)]">
        {cells.map((day, i) => {
          if (!day) {
            return <div key={i} className="bg-[var(--color-surface)] min-h-[64px]" />
          }
          const ds = toDateStr(day)
          const data = dailyMap[ds]
          const isToday = ds === today
          return (
            <button
              key={i}
              onClick={() => onSelectDate(ds)}
              className="bg-[var(--color-surface)] min-h-[64px] p-1 flex flex-col items-center hover:bg-[var(--color-surface-sub)] transition-colors"
            >
              <span className={cn(
                'text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full',
                isToday
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text)]'
              )}>
                {day}
              </span>
              {data?.expense ? (
                <span className="text-[10px] text-[var(--color-expense)] mt-0.5 leading-tight">
                  -{formatAmount(data.expense)}
                </span>
              ) : null}
              {data?.income ? (
                <span className="text-[10px] text-[var(--color-income)] leading-tight">
                  +{formatAmount(data.income)}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
