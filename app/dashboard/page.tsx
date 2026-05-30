'use client'

import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react'
import { useStore } from '@/lib/store'
import { getBudgetForMonth } from '@/lib/budget'
import { getDebtBalance, getExpenseAmount, getOutflowAmount, isDebtAssetType } from '@/lib/finance'
import { formatAmount } from '@/lib/utils'
import { getDisplayMonth, getMonthStartDay, getMonthRange } from '@/lib/monthStart'
import { fetcher } from '@/lib/fetcher'
import type { Transaction } from '@/lib/types'
import KpiCard from '@/components/dashboard/KpiCard'
import TrendChart from '@/components/dashboard/TrendChart'
import CategoryChart from '@/components/dashboard/CategoryChart'
import BudgetProgress from '@/components/dashboard/BudgetProgress'
import RecentList from '@/components/dashboard/RecentList'
import AssetSummary from '@/components/dashboard/AssetSummary'
import MonthlyInsights from '@/components/dashboard/MonthlyInsights'
import Link from 'next/link'

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
  const [monthStartDay, setMonthStartDay] = useState<number | null>(null)

  useEffect(() => {
    const startDay = getMonthStartDay()
    const displayMonth = getDisplayMonth(new Date(), startDay)
    setMonthStartDay(startDay)
    setYear(displayMonth.year)
    setMonth(displayMonth.month)
  }, [])

  const months6 = useMemo(() => prevMonths(year, month, 6), [year, month])

  // 6개월은 연속 구간이므로 전체 범위를 한 번에 조회한다 (월별 개별 호출 6 → 1).
  const rangeKey = useMemo(() => {
    if (monthStartDay === null || !ready) return null
    const from = getMonthRange(months6[0].year, months6[0].month, monthStartDay).from
    const to = getMonthRange(months6[5].year, months6[5].month, monthStartDay).to
    return `/api/transactions?from=${from}&to=${to}`
  }, [months6, monthStartDay, ready])

  const { data: allTxs, isLoading } = useSWR<Transaction[]>(rangeKey, fetcher)

  // 조회 결과를 월별 버킷으로 분할 (index 0 = 가장 오래된 달 … 5 = 이번 달).
  const monthTxs = useMemo(() => {
    const buckets: Transaction[][] = months6.map(() => [])
    if (!allTxs || monthStartDay === null) return buckets
    const ranges = months6.map(m => getMonthRange(m.year, m.month, monthStartDay))
    for (const tx of allTxs) {
      for (let i = 0; i < ranges.length; i++) {
        if (tx.date >= ranges[i].from && tx.date <= ranges[i].to) { buckets[i].push(tx); break }
      }
    }
    return buckets
  }, [allTxs, months6, monthStartDay])

  const loading = rangeKey !== null && !allTxs && isLoading

  function navMonth(dir: -1 | 1) {
    setMonth(prev => {
      let m = prev + dir
      let y = year
      if (m < 1) { m = 12; setYear(y - 1) }
      else if (m > 12) { m = 1; setYear(y + 1) }
      return m
    })
  }

  const currentTxs = monthTxs[5]
  const prevTxs = monthTxs[4]

  const income = currentTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const spending = getExpenseAmount(currentTxs)
  const outflow = getOutflowAmount(currentTxs)
  const prevIncome = prevTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const prevExpense = getOutflowAmount(prevTxs)

  const visibleAssets = assets.filter(a => a.visible)
  const totalAssetValue = visibleAssets.filter(a => !isDebtAssetType(a.group_type)).reduce((s, a) => s + a.balance, 0)
  const totalDebt = visibleAssets.filter(a => isDebtAssetType(a.group_type)).reduce((s, a) => s + getDebtBalance(a.balance), 0)
  const managedBalance = totalAssetValue - totalDebt

  const totalBudget = categories
    .filter(c => c.type === 'expense' && c.visible)
    .reduce((sum, cat) => sum + getBudgetForMonth(budgets, cat.id, year, month), 0)
  const budgetPct = totalBudget > 0 ? Math.round((spending / totalBudget) * 100) : 0

  const incomeChangePct = prevIncome > 0 ? Math.round(((income - prevIncome) / prevIncome) * 100) : null
  const expenseChangePct = prevExpense > 0 ? Math.round(((outflow - prevExpense) / prevExpense) * 100) : null
  const savingsChangePct = (() => {
    const s = income - outflow
    const ps = prevIncome - prevExpense
    if (ps <= 0) return null
    return Math.round(((s - ps) / Math.abs(ps)) * 100)
  })()

  const sparkIncomes = monthTxs.map((txs, i) => ({
    value: txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    isActive: i === 5,
  }))
  const sparkExpenses = monthTxs.map((txs, i) => ({
    value: getOutflowAmount(txs),
    isActive: i === 5,
  }))
  const sparkSavings = monthTxs.map((txs, i) => {
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const exp = getOutflowAmount(txs)
    return { value: inc - exp, isActive: i === 5 }
  })
  const sparkManagedBalance = monthTxs.map((_, i) => ({ value: managedBalance, isActive: i === 5 }))

  const trendData = months6.map((m, i) => {
    const txs = monthTxs[i]
    return {
      label: `${m.month}월`,
      income: txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expense: getOutflowAmount(txs),
    }
  })

  const upcomingSavings = [...savingsGoals]
    .filter(g => g.target_date)
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, 3)

  if (!ready || monthStartDay === null) {
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--color-text)]">대시보드</h1>
          <p className="mt-0.5 text-xs leading-4 text-[var(--color-text-sub)]">{yearMonthLabel} 재무 상태를 분석해요</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => navMonth(-1)} className="rounded-lg p-1.5 hover:bg-[var(--color-surface-sub)]" aria-label="이전 달">
              <ChevronLeft size={18} className="text-[var(--color-text-sub)]" />
            </button>
            <span className="text-sm font-medium text-[var(--color-text)] min-w-[60px] text-center">{month}월</span>
            <button onClick={() => navMonth(1)} className="rounded-lg p-1.5 hover:bg-[var(--color-surface-sub)]" aria-label="다음 달">
              <ChevronRight size={18} className="text-[var(--color-text-sub)]" />
            </button>
          </div>
          <button
            onClick={() => router.push('/transaction/new')}
            className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"
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
          label="관리 잔액"
          amount={managedBalance}
          badge={`관리 부채 ${formatAmount(totalDebt)}원`}
          icon={<Wallet size={18} />}
          sparks={sparkManagedBalance}
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
          amount={outflow}
          badge={expenseChangePct !== null ? `${expenseChangePct >= 0 ? '↑' : '↓'}${Math.abs(expenseChangePct)}% 소비 예산 ${budgetPct}% 소진` : totalBudget > 0 ? `소비 예산 ${budgetPct}% 소진` : undefined}
          icon={<TrendingDown size={18} />}
          sparks={sparkExpenses}
          amountColor="text-[var(--color-expense)]"
        />
        <KpiCard
          label="저축 가능액"
          amount={Math.max(0, income - outflow)}
          badge={savingsChangePct !== null ? `${savingsChangePct >= 0 ? '↑' : '↓'}${Math.abs(savingsChangePct)}% 지출률 ${income > 0 ? Math.round((outflow / income) * 100) : 0}%` : undefined}
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
      <BudgetProgress transactions={currentTxs} categories={categories} budgets={budgets} year={year} month={month} monthStartDay={monthStartDay} />

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
