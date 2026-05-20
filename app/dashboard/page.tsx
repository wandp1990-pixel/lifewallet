'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react'
import { useStore } from '@/lib/store'
import { formatAmount } from '@/lib/utils'
import type { Transaction, AssetGroupType } from '@/lib/types'
import KpiCard from '@/components/dashboard/KpiCard'
import TrendChart from '@/components/dashboard/TrendChart'
import CategoryChart from '@/components/dashboard/CategoryChart'
import BudgetProgress from '@/components/dashboard/BudgetProgress'
import RecentList from '@/components/dashboard/RecentList'
import AssetSummary from '@/components/dashboard/AssetSummary'
import MonthlyInsights from '@/components/dashboard/MonthlyInsights'
import Link from 'next/link'

const DEBT_TYPES: AssetGroupType[] = ['card', 'minus_account', 'loan', 'insurance']

function prevMonths(year: number, month: number, count: number): { year: number; month: number }[] {
  const result = []
  for (let i = count - 1; i >= 0; i--) {
    let y = year, m = month - i
    while (m <= 0) { m += 12; y-- }
    result.push({ year: y, month: m })
  }
  return result
}

export default function DashboardPage() {
  const router = useRouter()
  const { assets, categories, budgets, savingsGoals, ready } = useStore()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [txMap, setTxMap] = useState<Record<string, Transaction[]>>({})
  const [loading, setLoading] = useState(true)

  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  useEffect(() => {
    if (!ready) return
    const months = prevMonths(year, month, 6)
    const needed = months.filter(m => !txMap[`${m.year}-${String(m.month).padStart(2, '0')}`])
    if (needed.length === 0) { setLoading(false); return }

    setLoading(true)
    Promise.all(needed.map(m =>
      fetch(`/api/transactions?year=${m.year}&month=${m.month}`)
        .then(r => r.json())
        .then((txs: Transaction[]) => ({ key: `${m.year}-${String(m.month).padStart(2, '0')}`, txs }))
    )).then(results => {
      setTxMap(prev => {
        const next = { ...prev }
        for (const { key, txs } of results) next[key] = txs
        return next
      })
      setLoading(false)
    })
  }, [year, month, ready])

  function navMonth(dir: -1 | 1) {
    setMonth(prev => {
      let m = prev + dir
      let y = year
      if (m < 1) { m = 12; setYear(y - 1) }
      else if (m > 12) { m = 1; setYear(y + 1) }
      return m
    })
  }

  const currentTxs = txMap[monthKey] ?? []
  const prevKey = (() => {
    let y = year, m = month - 1
    if (m <= 0) { m = 12; y-- }
    return `${y}-${String(m).padStart(2, '0')}`
  })()
  const prevTxs = txMap[prevKey] ?? []

  const income = currentTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = currentTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const prevIncome = prevTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const prevExpense = prevTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const visibleAssets = assets.filter(a => a.visible)
  const totalAssetValue = visibleAssets.filter(a => !DEBT_TYPES.includes(a.group_type)).reduce((s, a) => s + a.balance, 0)
  const totalDebt = visibleAssets.filter(a => DEBT_TYPES.includes(a.group_type)).reduce((s, a) => s + Math.abs(a.balance), 0)
  const netWorth = totalAssetValue - totalDebt

  const totalBudget = budgets.filter(b => b.year === year && b.month === month).reduce((s, b) => s + b.amount, 0)
  const budgetPct = totalBudget > 0 ? Math.round((expense / totalBudget) * 100) : 0

  const incomeChangePct = prevIncome > 0 ? Math.round(((income - prevIncome) / prevIncome) * 100) : null
  const expenseChangePct = prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null
  const savingsChangePct = (() => {
    const s = income - expense
    const ps = prevIncome - prevExpense
    if (ps <= 0) return null
    return Math.round(((s - ps) / Math.abs(ps)) * 100)
  })()

  const months6 = prevMonths(year, month, 6)
  const sparkIncomes = months6.map((m, i) => ({
    value: txMap[`${m.year}-${String(m.month).padStart(2, '0')}`]?.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) ?? 0,
    isActive: i === 5,
  }))
  const sparkExpenses = months6.map((m, i) => ({
    value: txMap[`${m.year}-${String(m.month).padStart(2, '0')}`]?.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0) ?? 0,
    isActive: i === 5,
  }))
  const sparkSavings = months6.map((m, i) => {
    const inc = txMap[`${m.year}-${String(m.month).padStart(2, '0')}`]?.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) ?? 0
    const exp = txMap[`${m.year}-${String(m.month).padStart(2, '0')}`]?.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0) ?? 0
    return { value: inc - exp, isActive: i === 5 }
  })
  const sparkNetWorth = months6.map((m, i) => ({
    value: netWorth,
    isActive: i === 5,
  }))

  const trendData = months6.map(m => {
    const key = `${m.year}-${String(m.month).padStart(2, '0')}`
    const txs = txMap[key] ?? []
    return {
      label: `${m.month}월`,
      income: txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  })

  const upcomingSavings = [...savingsGoals]
    .filter(g => g.target_date)
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, 3)

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-sm">불러오는 중…</p>
      </div>
    )
  }

  const yearMonthLabel = `${year}년 ${month}월`

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">대시보드</h1>
          <p className="text-xs text-[var(--color-text-sub)] mt-0.5">{yearMonthLabel} 재무 상태를 분석해요</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => navMonth(-1)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)]">
              <ChevronLeft size={18} className="text-[var(--color-text-sub)]" />
            </button>
            <span className="text-sm font-medium text-[var(--color-text)] min-w-[60px] text-center">{month}월</span>
            <button onClick={() => navMonth(1)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)]">
              <ChevronRight size={18} className="text-[var(--color-text-sub)]" />
            </button>
          </div>
          <button
            onClick={() => router.push('/transaction/new')}
            className="flex items-center gap-1 h-9 px-3 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold"
          >
            <Plus size={15} /> 내역
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center text-xs text-[var(--color-text-sub)] py-2">데이터 불러오는 중…</div>
      )}

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="순자산"
          amount={netWorth}
          badge={`부채 ${formatAmount(totalDebt)}원`}
          icon={<Wallet size={18} />}
          sparks={sparkNetWorth}
        />
        <KpiCard
          label="이번 달 수입"
          amount={income}
          badge={incomeChangePct !== null ? `${incomeChangePct >= 0 ? '↑' : '↓'}${Math.abs(incomeChangePct)}% 전월 대비` : undefined}
          badgePositive={incomeChangePct !== null && incomeChangePct > 0}
          icon={<TrendingUp size={18} />}
          sparks={sparkIncomes}
          amountColor="text-[var(--color-income)]"
        />
        <KpiCard
          label="이번 달 지출"
          amount={expense}
          badge={expenseChangePct !== null ? `${expenseChangePct >= 0 ? '↑' : '↓'}${Math.abs(expenseChangePct)}% 예산 ${budgetPct}% 소진` : totalBudget > 0 ? `예산 ${budgetPct}% 소진` : undefined}
          icon={<TrendingDown size={18} />}
          sparks={sparkExpenses}
          amountColor="text-[var(--color-expense)]"
        />
        <KpiCard
          label="저축 가능액"
          amount={Math.max(0, income - expense)}
          badge={savingsChangePct !== null ? `${savingsChangePct >= 0 ? '↑' : '↓'}${Math.abs(savingsChangePct)}% 지출률 ${income > 0 ? Math.round((expense / income) * 100) : 0}%` : undefined}
          badgePositive={savingsChangePct !== null && savingsChangePct > 0}
          icon={<PiggyBank size={18} />}
          sparks={sparkSavings}
        />
      </div>

      {/* 월별 추이 */}
      <TrendChart data={trendData} />

      {/* 카테고리 지출 */}
      <CategoryChart transactions={currentTxs} categories={categories} yearMonth={yearMonthLabel} />

      {/* 예산 진행 */}
      <BudgetProgress transactions={currentTxs} categories={categories} budgets={budgets} year={year} month={month} />

      {/* 최근 내역 */}
      <RecentList transactions={currentTxs} categories={categories} assets={assets} />

      {/* 자산 현황 */}
      <AssetSummary assets={assets} />

      {/* 저축 목표 */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-[var(--color-text)]">이번 달 목표</p>
          {savingsGoals.length > 0 && (
            <Link href="/savings" className="text-xs text-[var(--color-primary)]">목표 관리 →</Link>
          )}
        </div>
        {savingsGoals.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-[var(--color-text-sub)] mb-3">저축 목표를 설정해 보세요</p>
            <Link href="/savings" className="inline-block h-9 px-4 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold leading-9">
              목표 설정하기
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingSavings.map(goal => {
              const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0
              return (
                <div key={goal.id} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-[var(--color-text)]">{goal.name}</span>
                    <span className="text-[var(--color-text-sub)]">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--color-surface-sub)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {savingsGoals.length > 3 && (
              <p className="text-xs text-[var(--color-text-sub)] text-center">+{savingsGoals.length - 3}개 더 보기</p>
            )}
          </div>
        )}
      </div>

      {/* 인사이트 */}
      <MonthlyInsights
        transactions={currentTxs}
        prevTransactions={prevTxs}
        categories={categories}
        budgets={budgets}
        year={year}
        month={month}
      />
    </div>
  )
}
