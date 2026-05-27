'use client'

import { getBudgetForMonth, getBudgetPace } from '@/lib/budget'
import { categoryColor } from '@/lib/colors'
import { formatAmount } from '@/lib/utils'
import type { Transaction, Category, Budget } from '@/lib/types'
import BudgetTodayMarker from '@/components/ui/BudgetTodayMarker'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  year: number
  month: number
  monthStartDay: number
}

export default function BudgetProgress({ transactions, categories, budgets, year, month, monthStartDay }: Props) {
  const expenseCategories = categories.filter(c => c.type === 'expense' && c.visible)
  const expenses = transactions.filter(t => t.type === 'expense')

  const rows = expenseCategories.map(cat => {
    const used = expenses.filter(t => t.category_id === cat.id).reduce((s, t) => s + t.amount, 0)
    const budget = getBudgetForMonth(budgets, cat.id, year, month)
    const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0
    const over = budget > 0 && used > budget
    return { cat, used, budget, pct, over }
  }).filter(r => r.used > 0 || r.budget > 0)
  const totalUsed = rows.reduce((sum, row) => sum + row.used, 0)
  const totalBudget = rows.reduce((sum, row) => sum + row.budget, 0)
  const pace = getBudgetPace(totalBudget, totalUsed, year, month, monthStartDay)
  const totalPct = Math.min(100, Math.round(pace.spendPct))
  const isFast = pace.isCurrentPeriod && pace.spendPct > pace.dayPct + 5

  if (rows.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
        <p className="text-sm font-semibold text-[var(--color-text)] mb-4">소비 예산 진행 상황</p>
        <p className="text-sm text-center text-[var(--color-text-sub)] py-4">소비 예산이 설정되지 않았습니다</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
      <p className="text-sm font-semibold text-[var(--color-text)] mb-4">소비 예산 진행 상황</p>
      {totalBudget > 0 && (
        <div className="mb-4 rounded-xl bg-[var(--color-surface-sub)] px-3 py-3">
          <div className="flex justify-between text-[12px] text-[var(--color-text-sub)] mb-2">
            <span>월 진행 {pace.dayPct.toFixed(0)}%</span>
            <span className={isFast ? 'text-[var(--color-expense)]' : 'text-[var(--color-primary)]'}>
              예산 {pace.spendPct.toFixed(0)}% 소진
            </span>
          </div>
          <div className="relative pt-7">
            {pace.isCurrentPeriod && (
              <BudgetTodayMarker dayPct={pace.dayPct} clampedDayPct={pace.clampedDayPct} label />
            )}
            <div className="h-2 rounded-full bg-[var(--color-border)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${totalPct}%`,
                  backgroundColor: pace.spendPct >= 100 ? 'var(--color-expense)' : isFast ? 'var(--color-warning)' : 'var(--color-primary)',
                }}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-[var(--color-text-sub)] tabular-nums">
            <span>{formatAmount(totalUsed)} / {formatAmount(totalBudget)}원</span>
            {pace.isCurrentPeriod && <span>월말 예상 {formatAmount(pace.projectedSpend)}원</span>}
          </div>
        </div>
      )}
      <div className="space-y-3">
        {rows.map(({ cat, used, budget, pct, over }) => (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: categoryColor(cat.id) }} />
              <span className="text-xs text-[var(--color-text-body)] flex-1">{cat.name}</span>
              <span className={`text-xs font-medium tabular-nums ${over ? 'text-[var(--color-expense)]' : 'text-[var(--color-text-sub)]'}`}>
                {over ? `초과 ${formatAmount(used - budget)}원` : budget > 0 ? `잔여 ${formatAmount(budget - used)}원` : ''}
              </span>
            </div>
            <div className="relative">
              {budget > 0 && pace.isCurrentPeriod && (
                <BudgetTodayMarker dayPct={pace.dayPct} clampedDayPct={pace.clampedDayPct} />
              )}
              <div className="h-1.5 rounded-full bg-[var(--color-surface-sub)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: over ? 'var(--color-expense)' : categoryColor(cat.id),
                  }}
                />
              </div>
            </div>
            {budget > 0 && (
              <p className="text-[10px] text-[var(--color-text-sub)] mt-0.5 text-right tabular-nums">
                {formatAmount(used)} / {formatAmount(budget)}원
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
