'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Transaction } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import { getMonthRange } from '@/lib/monthStart'

const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtMD(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}. ${parseInt(d)}.`
}

interface WeekRow {
  from: string
  to: string
  income: number
  expense: number
  isCurrent: boolean
}

interface MonthData {
  month: number
  income: number
  expense: number
  weeks: WeekRow[]
  to: string
}

interface Props {
  year: number
  transactions: Transaction[]
  monthStartDay: number
  loading: boolean
}

export default function MonthlyTab({ year, transactions, monthStartDay, loading }: Props) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const defaultExpanded = year === currentYear ? currentMonth : 12
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set([defaultExpanded]))

  const monthData = useMemo<MonthData[]>(() => {
    const result: MonthData[] = []
    const maxMonth = year === currentYear ? currentMonth : 12

    for (let m = maxMonth; m >= 1; m--) {
      const { from, to } = getMonthRange(year, m, monthStartDay)
      const periodTxns = transactions.filter(t => t.date >= from && t.date <= to && t.type !== 'asset')

      const monthIncome = periodTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const monthExpense = periodTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

      // 7일 단위 주간 분할
      const weeks: WeekRow[] = []
      let cursor = from
      while (cursor <= to) {
        const weekTo = addDays(cursor, 6)
        const weekTxns = periodTxns.filter(t => t.date >= cursor && t.date <= weekTo)
        const wIncome = weekTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const wExpense = weekTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
        weeks.push({ from: cursor, to: weekTo, income: wIncome, expense: wExpense, isCurrent: todayStr >= cursor && todayStr <= weekTo })
        cursor = addDays(cursor, 7)
      }

      result.push({ month: m, income: monthIncome, expense: monthExpense, weeks, to })
    }
    return result
  }, [year, transactions, monthStartDay, currentYear, currentMonth, todayStr])

  // 요약 카드: 완료된 가장 최근 회계 월
  const summaryMonth = useMemo(
    () => monthData.find(md => md.to < todayStr) ?? monthData[0],
    [monthData, todayStr]
  )

  function toggleMonth(m: number) {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-[var(--color-text-sub)] text-sm">
        불러오는 중…
      </div>
    )
  }

  if (monthData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-[15px]">거래 내역이 없습니다</p>
      </div>
    )
  }

  return (
    <div>
      {/* 요약 카드 */}
      {summaryMonth && (
        <div className="mx-4 mt-3 mb-2 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] px-4 py-3 shadow-[0px_1px_6px_rgba(0,0,0,0.06)]">
          <div className="flex items-baseline justify-between mb-2">
            <p className={`text-[22px] font-bold tabular-nums ${summaryMonth.income - summaryMonth.expense >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
              {summaryMonth.income - summaryMonth.expense >= 0 ? '+' : ''}{formatAmount(Math.abs(summaryMonth.income - summaryMonth.expense))}원
            </p>
            <p className="text-[11px] text-[var(--color-text-sub)]">{MONTH_NAMES[summaryMonth.month - 1]} 합계</p>
          </div>
          {(summaryMonth.income + summaryMonth.expense) > 0 ? (
            <div className="h-[5px] rounded-full overflow-hidden flex mb-2">
              <div
                className="h-full bg-[var(--color-income)]"
                style={{ width: `${Math.round(summaryMonth.income / (summaryMonth.income + summaryMonth.expense) * 100)}%` }}
              />
              <div className="flex-1 h-full bg-[var(--color-expense)]" />
            </div>
          ) : (
            <div className="h-[5px] rounded-full bg-[var(--color-surface-sub)] mb-2" />
          )}
          <div className="flex justify-between text-[12px]">
            <span className="text-[var(--color-text-sub)]">■ 수입 <span className="font-semibold text-[var(--color-income)]">{formatAmount(summaryMonth.income)}원</span></span>
            <span className="text-[var(--color-text-sub)]">■ 지출 <span className="font-semibold text-[var(--color-expense)]">{formatAmount(summaryMonth.expense)}원</span></span>
          </div>
        </div>
      )}

      {/* 월별 섹션 */}
      <div className="divide-y divide-[var(--color-border)]">
        {monthData.map(md => {
          const isExpanded = expandedMonths.has(md.month)
          const net = md.income - md.expense
          return (
            <div key={md.month}>
              {/* 월 헤더 */}
              <button
                onClick={() => toggleMonth(md.month)}
                className="w-full flex items-center px-4 py-3 gap-3 hover:bg-[var(--color-surface-sub)] active:bg-[var(--color-surface-sub)] transition-colors"
              >
                <span className="text-[17px] font-bold text-[var(--color-text)] w-9 shrink-0 text-left">
                  {MONTH_NAMES[md.month - 1]}
                </span>
                <div className="flex-1 text-right">
                  {md.income > 0 && (
                    <p className="text-[13px] font-semibold text-[var(--color-income)] tabular-nums">
                      {formatAmount(md.income)}원
                    </p>
                  )}
                  {md.expense > 0 && (
                    <p className="text-[13px] font-semibold text-[var(--color-expense)] tabular-nums">
                      {formatAmount(md.expense)}원
                    </p>
                  )}
                  <p className={`text-[12px] tabular-nums ${net >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
                    합계 {net >= 0 ? '+' : ''}{formatAmount(Math.abs(net))}원
                  </p>
                </div>
                {isExpanded
                  ? <ChevronUp size={16} className="text-[var(--color-text-sub)] shrink-0" />
                  : <ChevronDown size={16} className="text-[var(--color-text-sub)] shrink-0" />}
              </button>

              {/* 주간 행 */}
              {isExpanded && (
                <div className="bg-[var(--color-bg)]">
                  {md.weeks.map(w => {
                    const wNet = w.income - w.expense
                    return (
                      <div
                        key={w.from}
                        className={`flex items-center px-4 py-2.5 border-t border-[var(--color-border)] ${w.isCurrent ? 'bg-[#fff4f5]' : ''}`}
                      >
                        <span className="text-[13px] text-[var(--color-text-sub)] flex-1">
                          {fmtMD(w.from)} ~ {fmtMD(w.to)}
                        </span>
                        <div className="text-right">
                          {w.income > 0 && (
                            <p className="text-[13px] font-medium text-[var(--color-income)] tabular-nums">
                              {formatAmount(w.income)}원
                            </p>
                          )}
                          {w.expense > 0 && (
                            <p className="text-[13px] font-medium text-[var(--color-expense)] tabular-nums">
                              {formatAmount(w.expense)}원
                            </p>
                          )}
                          <p className={`text-[12px] tabular-nums ${wNet >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
                            {wNet === 0 ? '0원' : `${wNet > 0 ? '+' : ''}${formatAmount(Math.abs(wNet))}원`}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
