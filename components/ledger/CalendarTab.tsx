'use client'

import type { Transaction } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import { getMonthRange } from '@/lib/monthStart'

interface Props {
  year: number
  month: number
  monthStartDay: number
  transactions: Transaction[]
  onSelectDate: (date: string) => void
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토']


function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export default function CalendarTab({ year, month, monthStartDay, transactions, onSelectDate }: Props) {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const { from, to } = getMonthRange(year, month, monthStartDay)
  const rangeStart = new Date(`${from}T00:00:00`)
  const rangeEnd = new Date(`${to}T00:00:00`)
  const gridStart = addDays(rangeStart, -rangeStart.getDay())
  const gridEnd = addDays(rangeEnd, 6 - rangeEnd.getDay())

  type Cell = { date: string; d: number; m: number; y: number; isCurrentPeriod: boolean }
  const cells: Cell[] = []

  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    const ds = fmtDate(cursor)
    cells.push({
      date: ds,
      d: cursor.getDate(),
      m: cursor.getMonth() + 1,
      y: cursor.getFullYear(),
      isCurrentPeriod: ds >= from && ds <= to,
    })
  }

  // 날짜별 수입/지출/상환 집계 — 요약 바와 동일하게 상환을 별도 색으로 분리.
  // 이체 수수료는 지출 줄에 포함 (소액·시각적 노이즈 최소화).
  const dailyMap: Record<string, { income: number; expense: number; loanRepayment: number }> = {}
  for (const t of transactions) {
    if (t.type === 'asset') continue
    if (!dailyMap[t.date]) dailyMap[t.date] = { income: 0, expense: 0, loanRepayment: 0 }
    if (t.type === 'income') dailyMap[t.date].income += t.amount
    else if (t.type === 'expense') dailyMap[t.date].expense += t.amount
    else if (t.type === 'loan_repayment') dailyMap[t.date].loanRepayment += t.amount
    else if (t.type === 'transfer') dailyMap[t.date].expense += t.fee ?? 0
  }

  function dayLabel(c: Cell): string {
    return c.d === 1 ? `${c.m}.${c.d}.` : String(c.d)
  }

  return (
    <div className="h-full grid grid-rows-[auto_1fr]">
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

      {/* 날짜 그리드 — 부모(1fr) 높이에 맞춰 행 균등 분배 (스크롤 없음) */}
      <div className="min-h-0 grid grid-cols-7 auto-rows-fr gap-px bg-[var(--color-border)]">
        {cells.map((cell, i) => {
          const col = i % 7
          const ds  = cell.date
          const data = cell.isCurrentPeriod ? dailyMap[ds] : undefined
          const isToday = ds === today
          const isCur = cell.isCurrentPeriod

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
              className={`flex flex-col items-center pt-2 pb-1.5 min-h-0 gap-0.5 transition-colors ${
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

              {/* 지출 (이체 수수료 포함) */}
              {data?.expense ? (
                <span className="text-[10px] leading-none text-[var(--color-expense)]">
                  -{formatAmount(data.expense)}
                </span>
              ) : null}

              {/* 상환 — 요약 바와 동일하게 주황색으로 분리 */}
              {data?.loanRepayment ? (
                <span className="text-[10px] leading-none text-[var(--color-warning)]">
                  -{formatAmount(data.loanRepayment)}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
