'use client'

import Link from 'next/link'
import { categoryColor } from '@/lib/colors'
import { formatAmount } from '@/lib/utils'
import type { Transaction, Category, Budget } from '@/lib/types'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  year: number
  month: number
}

export default function BudgetProgress({ transactions, categories, budgets, year, month }: Props) {
  const expenseCategories = categories.filter(c => c.type === 'expense')
  const expenses = transactions.filter(t => t.type === 'expense')

  const rows = expenseCategories.map(cat => {
    const used = expenses.filter(t => t.category_id === cat.id).reduce((s, t) => s + t.amount, 0)
    const budgetEntry = budgets.find(b => b.year === year && b.month === month && b.category_id === cat.id)
    const budget = budgetEntry?.amount ?? 0
    const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0
    const over = budget > 0 && used > budget
    return { cat, used, budget, pct, over }
  }).filter(r => r.used > 0 || r.budget > 0)

  if (rows.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">예산 진행 상황</p>
          <Link href="/statistics/budget-settings" className="text-xs text-[var(--color-primary)]">예산 편집 →</Link>
        </div>
        <p className="text-sm text-center text-[var(--color-text-sub)] py-4">예산이 설정되지 않았습니다</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-[var(--color-text)]">예산 진행 상황</p>
        <Link href="/statistics/budget-settings" className="text-xs text-[var(--color-primary)]">예산 편집 →</Link>
      </div>
      <div className="space-y-3">
        {rows.map(({ cat, used, budget, pct, over }) => (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: categoryColor(cat.id) }} />
              <span className="text-xs text-[var(--color-text-body)] flex-1">{cat.icon} {cat.name}</span>
              <span className={`text-xs font-medium tabular-nums ${over ? 'text-[var(--color-expense)]' : 'text-[var(--color-text-sub)]'}`}>
                {over ? `초과 ${formatAmount(used - budget)}원` : budget > 0 ? `잔여 ${formatAmount(budget - used)}원` : ''}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-surface-sub)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: over ? 'var(--color-expense)' : categoryColor(cat.id),
                }}
              />
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
