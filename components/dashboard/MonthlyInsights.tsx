'use client'

import type { Transaction, Category, Budget } from '@/lib/types'

interface Props {
  transactions: Transaction[]
  prevTransactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  year: number
  month: number
}

interface Insight {
  type: 'positive' | 'warning'
  message: string
}

export default function MonthlyInsights({ transactions, prevTransactions, categories, budgets, year, month }: Props) {
  const expenses = transactions.filter(t => t.type === 'expense')
  const prevExpenses = prevTransactions.filter(t => t.type === 'expense')
  const incomes = transactions.filter(t => t.type === 'income')
  const prevIncomes = prevTransactions.filter(t => t.type === 'income')

  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0)
  const prevTotalExpense = prevExpenses.reduce((s, t) => s + t.amount, 0)
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0)
  const prevTotalIncome = prevIncomes.reduce((s, t) => s + t.amount, 0)

  const insights: Insight[] = []

  // 1. 예산 초과 카테고리
  const catExpenses = expenses.reduce<Record<string, number>>((acc, t) => {
    if (t.category_id) acc[t.category_id] = (acc[t.category_id] || 0) + t.amount
    return acc
  }, {})
  const overBudgetCats = budgets
    .filter(b => b.year === year && b.month === month && b.amount > 0)
    .filter(b => (catExpenses[b.category_id] || 0) > b.amount)
    .map(b => ({ cat: categories.find(c => c.id === b.category_id)?.name ?? '알 수 없음', over: (catExpenses[b.category_id] || 0) - b.amount }))
    .sort((a, b) => b.over - a.over)

  for (const { cat } of overBudgetCats.slice(0, 2)) {
    insights.push({ type: 'warning', message: `${cat}가 이번 달 예산을 초과했어요!` })
  }
  if (insights.length >= 3) return <Render insights={insights} />

  // 2. 지출 변동
  if (prevTotalExpense > 0 && totalExpense > 0) {
    const diff = (totalExpense - prevTotalExpense) / prevTotalExpense
    if (diff <= -0.2) insights.push({ type: 'positive', message: '지출이 지난달보다 크게 줄었어요!' })
    else if (diff >= 0.2) insights.push({ type: 'warning', message: '지출이 지난달보다 크게 늘었어요.' })
  }
  if (insights.length >= 3) return <Render insights={insights} />

  // 3. 수입 변동
  if (prevTotalIncome > 0 && totalIncome > 0) {
    const diff = (totalIncome - prevTotalIncome) / prevTotalIncome
    if (diff >= 0.2) insights.push({ type: 'positive', message: '이번 달 수입이 지난달보다 늘었어요!' })
    else if (diff <= -0.2) insights.push({ type: 'warning', message: '이번 달 수입이 지난달보다 줄었어요.' })
  }
  if (insights.length >= 3) return <Render insights={insights} />

  // 4. 저축 가능액 증가
  const savings = totalIncome - totalExpense
  const prevSavings = prevTotalIncome - prevTotalExpense
  if (savings > 0 && savings > prevSavings) {
    insights.push({ type: 'positive', message: '이번 달은 지난달보다 더 모을 수 있어요!' })
  }

  if (insights.length === 0) return null
  return <Render insights={insights} />
}

function Render({ insights }: { insights: { type: 'positive' | 'warning'; message: string }[] }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
      <p className="text-sm font-semibold text-[var(--color-text)] mb-3">이번 달 소식</p>
      <div className="space-y-2">
        {insights.slice(0, 3).map((ins, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 p-3 rounded-xl text-sm ${ins.type === 'positive' ? 'bg-[#edfbf4] text-[#016b43]' : 'bg-[#fff8ed] text-[#a35f00]'}`}
          >
            <span>{ins.type === 'positive' ? '✅' : '⚠️'}</span>
            <span>{ins.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
