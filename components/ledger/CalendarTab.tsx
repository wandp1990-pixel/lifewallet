'use client'

import type { Transaction } from '@/lib/types'
import { formatAmount } from '@/lib/utils'

interface Props {
  year: number
  month: number
  transactions: Transaction[]
  onSelectDate: (date: string) => void
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토']


export default function CalendarTab({ year, month, transactions, onSelectDate }: Props) {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const firstDow = new Date(year, month - 1, 1).getDay() // 0=일
  const lastDate = new Date(year, month, 0).getDate()

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year
  const prevLast  = new Date(prevYear, prevMonth, 0).getDate()
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year

  // 셀 생성
  type Cell = { type: 'prev' | 'cur' | 'next'; d: number; m: number; y: number }
  const cells: Cell[] = []

  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ type: 'prev', d: prevLast - i, m: prevMonth, y: prevYear })
  }
  for (let d = 1; d <= lastDate; d++) {
    cells.push({ type: 'cur', d, m: month, y: year })
  }
  let nd = 1
  while (cells.length % 7 !== 0) {
    cells.push({ type: 'next', d: nd++, m: nextMonth, y: nextYear })
  }

  // 날짜별 수입/지출 집계
  const dailyMap: Record<string, { income: number; expense: number }> = {}
  for (const t of transactions) {
    if (t.type === 'asset') continue
    if (!dailyMap[t.date]) dailyMap[t.date] = { income: 0, expense: 0 }
    if (t.type === 'income') dailyMap[t.date].income += t.amount
    if (t.type === 'expense' || t.type === 'loan_repayment') dailyMap[t.date].expense += t.amount
  }

  function toDateStr(c: Cell) {
    return `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`
  }

  function dayLabel(c: Cell): string {
    return c.d === 1 ? `${c.m}.${c.d}.` : String(c.d)
  }

  return (
    <div className="pb-4">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
        {DAY_HEADERS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[12px] font-medium py-2 ${
              i === 0 ? 'text-[var(--color-expense)]' :
              i === 6 ? 'text-[var(--color-primary)]' :
              'text-[var(--color-text-sub)]'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-px bg-[var(--color-border)]">
        {cells.map((cell, i) => {
          const col = i % 7
          const ds  = toDateStr(cell)
          const data   = cell.type === 'cur' ? dailyMap[ds] : undefined
          const isToday = ds === today
          const isCur  = cell.type === 'cur'

          const numColor = isCur
            ? col === 0 ? 'text-[var(--color-expense)]'
            : col === 6 ? 'text-[var(--color-primary)]'
            : 'text-[var(--color-text)]'
            : 'text-[var(--color-text-placeholder)]'

          return (
            <button
              key={i}
              onClick={() => isCur && onSelectDate(ds)}
              disabled={!isCur}
              className={`flex flex-col items-center pt-2 pb-1.5 min-h-[60px] gap-0.5 transition-colors ${
                isCur
                  ? 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-sub)] active:bg-[var(--color-surface-sub)]'
                  : 'bg-[var(--color-bg)]'
              }`}
            >
              {/* 날짜 숫자 */}
              <span className={`text-[13px] font-semibold leading-none w-7 h-7 flex items-center justify-center rounded-full ${
                isToday
                  ? 'bg-[var(--color-primary)] text-white'
                  : numColor
              }`}>
                {dayLabel(cell)}
              </span>

              {/* 수입 */}
              {data?.income ? (
                <span className="text-[10px] leading-none text-[var(--color-income)]">
                  +{formatAmount(data.income)}
                </span>
              ) : null}

              {/* 지출 */}
              {data?.expense ? (
                <span className="text-[10px] leading-none text-[var(--color-expense)]">
                  -{formatAmount(data.expense)}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
