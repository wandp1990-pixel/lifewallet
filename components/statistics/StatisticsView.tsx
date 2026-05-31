'use client'

import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { getExpenseAmount } from '@/lib/finance'
import { useStore } from '@/lib/store'
import type { Transaction, Category } from '@/lib/types'
import { getBudgetForMonth, getBudgetPace, isDirectBudget } from '@/lib/budget'
import { categoryColor } from '@/lib/colors'
import { formatAmount } from '@/lib/utils'
import CatIcon from '@/components/ui/CatIcon'
import BudgetTodayMarker from '@/components/ui/BudgetTodayMarker'
import { getDisplayMonth, getMonthStartDay, getMonthRange } from '@/lib/monthStart'
import { fetcher } from '@/lib/fetcher'

type StatView = 'category' | 'budget' | 'content'
type ContentType = 'expense' | 'income'
type CategoryType = 'expense' | 'income'
type ContentPeriod = 'month' | 'week' | 'year'

const VIEW_LABELS: Record<StatView, string> = {
  category: '카테고리별',
  budget: '예산',
  content: '내용별',
}

// 주 번호 계산 (해당 월 내 몇 번째 주)
function weekOfMonth(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const firstDay = new Date(y, mo - 1, 1).getDay()
  const week = Math.ceil((d + firstDay) / 7)
  return `${mo}월 ${week}주차`
}

export default function StatisticsView() {
  const { categories, budgets, ready } = useStore()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [monthStartDay, setMonthStartDay] = useState<number | null>(null)
  const [view, setView] = useState<StatView>('category')
  const [categoryType, setCategoryType] = useState<CategoryType>('expense')
  const [contentType, setContentType] = useState<ContentType>('expense')
  const [contentPeriod, setContentPeriod] = useState<ContentPeriod>('month')

  useEffect(() => {
    const startDay = getMonthStartDay()
    const displayMonth = getDisplayMonth(new Date(), startDay)
    setMonthStartDay(startDay)
    setYear(displayMonth.year)
    setMonth(displayMonth.month)
  }, [])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const txUrl = useMemo(() => {
    if (monthStartDay === null) return null
    const { from, to } = getMonthRange(year, month, monthStartDay)
    return `/api/transactions?from=${from}&to=${to}`
  }, [year, month, monthStartDay])

  const yearlyUrl = useMemo(() => {
    if (monthStartDay === null || contentPeriod !== 'year') return null
    const { from } = getMonthRange(year, 1, monthStartDay)
    const { to } = getMonthRange(year, 12, monthStartDay)
    return `/api/transactions?from=${from}&to=${to}`
  }, [year, monthStartDay, contentPeriod])

  const { data: transactions = [], isLoading: loading } = useSWR<Transaction[]>(txUrl, fetcher)
  const { data: yearlyTransactions = [], isLoading: yearlyLoading } = useSWR<Transaction[]>(yearlyUrl, fetcher)

  const expenseCategories = useMemo(
    () => categories.filter(c => c.type === 'expense' && c.visible).sort((a, b) => a.order - b.order),
    [categories]
  )

  const totalIncome = useMemo(
    () => transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [transactions]
  )
  const totalExpense = useMemo(
    () => getExpenseAmount(transactions),
    [transactions]
  )
  // 카테고리별 수입/지출 집계
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of transactions) {
      if (t.type !== categoryType) continue
      const key = t.category_id || ''
      map[key] = (map[key] ?? 0) + t.amount
    }
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
    return entries.map(([categoryId, amount]) => {
      const cat = categories.find(c => c.id === categoryId)
      return {
        categoryId,
        name: cat ? cat.name : '미분류',
        icon: cat?.icon ?? '📦',
        catName: cat?.name ?? '미분류',
        amount,
        pct: (categoryType === 'income' ? totalIncome : totalExpense) > 0
          ? (amount / (categoryType === 'income' ? totalIncome : totalExpense)) * 100
          : 0,
        color: categoryColor(categoryId),
      }
    })
  }, [transactions, categories, categoryType, totalIncome, totalExpense])

  // 예산 뷰
  const budgetStats = useMemo(() => {
    return expenseCategories.map(cat => {
      const budget = getBudgetForMonth(budgets, cat.id, year, month)
      const spent = transactions
        .filter(t => t.type === 'expense' && t.category_id === cat.id)
        .reduce((s, t) => s + t.amount, 0)
      const isDirect = isDirectBudget(budgets, cat.id, year, month)
      return { cat, budget, spent, isDirect, pct: budget > 0 ? Math.min((spent / budget) * 100, 100) : 0, over: budget > 0 && spent > budget }
    })
  }, [expenseCategories, budgets, transactions, year, month])

  const totalBudget = budgetStats.reduce((s, b) => s + b.budget, 0)
  const budgetPct = totalBudget > 0 ? Math.min((totalExpense / totalBudget) * 100, 100) : 0
  const budgetPace = monthStartDay === null ? null : getBudgetPace(totalBudget, totalExpense, year, month, monthStartDay)

  // 내용별 집계
  const contentStats = useMemo(() => {
    const sourceTransactions = contentPeriod === 'year' ? yearlyTransactions : transactions
    const filtered = sourceTransactions.filter(t => t.type === contentType)
    let grouped: Record<string, { key: string; label: string; transactions: Transaction[] }>

    if (contentPeriod === 'month') {
      const map: Record<string, Transaction[]> = {}
      for (const t of filtered) {
        const key = t.content || '(내용 없음)'
        if (!map[key]) map[key] = []
        map[key].push(t)
      }
      grouped = Object.fromEntries(
        Object.entries(map).map(([k, txs]) => [k, { key: k, label: k, transactions: txs }])
      )
    } else if (contentPeriod === 'week') {
      const map: Record<string, { label: string; transactions: Transaction[] }> = {}
      for (const t of filtered) {
        const key = weekOfMonth(t.date)
        if (!map[key]) map[key] = { label: key, transactions: [] }
        map[key].transactions.push(t)
      }
      grouped = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { key: k, ...v }]))
    } else {
      // year
      const map: Record<string, Transaction[]> = {}
      for (const t of filtered) {
        const key = t.content || '(내용 없음)'
        if (!map[key]) map[key] = []
        map[key].push(t)
      }
      grouped = Object.fromEntries(
        Object.entries(map).map(([k, txs]) => [k, { key: k, label: k, transactions: txs }])
      )
    }

    return Object.values(grouped)
      .map(g => ({ label: g.label, count: g.transactions.length, total: g.transactions.reduce((s, t) => s + t.amount, 0) }))
      .sort((a, b) => b.total - a.total)
  }, [transactions, yearlyTransactions, contentType, contentPeriod])

  if (!ready || monthStartDay === null) return null

  return (
    <div className="min-h-screen bg-[var(--color-surface)]">
      {/* 헤더 */}
      <div className="sticky top-0 z-30 bg-[var(--color-surface)] border-b border-[var(--color-border)] shadow-[0_1px_0_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={prevMonth} className="p-1 text-[var(--color-text-sub)]">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <div className="text-[17px] font-semibold text-[var(--color-text)]">{year}년 {month}월</div>
          </div>
          <button onClick={nextMonth} className="p-1 text-[var(--color-text-sub)]">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 뷰 탭 */}
        <div className="flex px-4 pb-0">
          {(Object.keys(VIEW_LABELS) as StatView[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                view === v
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-sub)]'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto pb-24">
        {loading || (contentPeriod === 'year' && yearlyLoading) ? (
          <div className="flex justify-center py-16 text-[var(--color-text-sub)] text-sm">
            불러오는 중…
          </div>
        ) : (
          <>
            {view === 'category' && (
              <CategoryView
                stats={categoryStats}
                total={categoryType === 'income' ? totalIncome : totalExpense}
                categoryType={categoryType}
                setCategoryType={setCategoryType}
              />
            )}
            {view === 'budget' && (
              <BudgetView
                stats={budgetStats}
                total={totalExpense}
                totalBudget={totalBudget}
                budgetPct={budgetPct}
                pace={budgetPace}
              />
            )}
            {view === 'content' && (
              <ContentView
                stats={contentStats}
                contentType={contentType}
                setContentType={setContentType}
                contentPeriod={contentPeriod}
                setContentPeriod={setContentPeriod}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ──────────────── 카테고리 뷰 ──────────────── */

interface CategoryStat {
  categoryId: string
  name: string
  icon: string
  catName: string
  amount: number
  pct: number
  color: string
}

function CategoryTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.12)] text-xs">
      <p className="font-semibold text-[var(--color-text)]">{payload[0].name}</p>
      <p className="text-[var(--color-text-body)]">{formatAmount(payload[0].value)}원</p>
    </div>
  )
}

function CategoryView({
  stats, total, categoryType, setCategoryType,
}: {
  stats: CategoryStat[]
  total: number
  categoryType: CategoryType
  setCategoryType: (v: CategoryType) => void
}) {
  const isIncome = categoryType === 'income'

  if (total === 0) {
    return (
      <div className="px-4 pt-4">
        <CategoryTypeTabs value={categoryType} onChange={setCategoryType} />
        <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-sub)]">
          <p className="text-[15px]">이번 달 {isIncome ? '수입' : '지출'} 내역이 없습니다</p>
        </div>
      </div>
    )
  }

  const chartData = stats.map(s => ({ name: s.name, value: s.amount, color: s.color }))

  return (
    <div className="px-4 pt-4">
      <CategoryTypeTabs value={categoryType} onChange={setCategoryType} />

      {/* 도넛 차트 */}
      <div className="flex justify-center mb-4">
        <div className="relative">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie data={chartData} dataKey="value" innerRadius={55} outerRadius={85} strokeWidth={0}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={<CategoryTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[11px] text-[var(--color-text-sub)]">총 {isIncome ? '수입' : '지출'}</p>
            <p className={`text-[15px] font-bold tabular-nums ${isIncome ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>{formatAmount(total)}원</p>
          </div>
        </div>
      </div>

      {/* 카테고리 목록 */}
      <div className="space-y-0">
        {stats.map(s => (
          <div key={s.categoryId} className="flex items-center gap-3 py-3 border-b border-[var(--color-border)] last:border-0">
            <CatIcon icon={s.icon} id={s.categoryId} size={32} />
            <span className="flex-1 text-[14px] text-[var(--color-text)] truncate">{s.catName}</span>
            <span className="text-[13px] text-[var(--color-text-sub)] w-10 text-right tabular-nums">
              {s.pct.toFixed(1)}%
            </span>
            <span className="text-[14px] font-semibold text-[var(--color-text)] tabular-nums w-28 text-right">
              {formatAmount(s.amount)}원
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryTypeTabs({ value, onChange }: { value: CategoryType; onChange: (v: CategoryType) => void }) {
  return (
    <div className="mb-4 flex gap-2">
      {(['income', 'expense'] as CategoryType[]).map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`h-9 rounded-full px-4 text-[13px] font-medium transition-colors ${
            value === t
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-surface-sub)] text-[var(--color-text-sub)]'
          }`}
        >
          {t === 'income' ? '수입' : '지출'}
        </button>
      ))}
    </div>
  )
}

/* ──────────────── 예산 뷰 ──────────────── */

interface BudgetStat {
  cat: Category
  budget: number
  spent: number
  isDirect: boolean
  pct: number
  over: boolean
}

function BudgetView({
  stats, total, totalBudget, budgetPct, pace,
}: {
  stats: BudgetStat[]
  total: number
  totalBudget: number
  budgetPct: number
  pace: ReturnType<typeof getBudgetPace> | null
}) {
  if (totalBudget === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--color-text-sub)]">
        <p className="text-[15px] text-center">예산을 설정하면 지출 현황을 비교할 수 있습니다</p>
        <Link
          href="/statistics/budget-settings"
          className="px-5 py-2 rounded-xl text-[14px] font-semibold text-[var(--color-primary)] border border-[var(--color-primary)]"
        >
          예산 설정
        </Link>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 space-y-4">
      {/* 전체 요약 */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.08)]">
        <div className="flex justify-between text-[13px] text-[var(--color-text-sub)] mb-2">
          <span>총 예산 {formatAmount(totalBudget)}원</span>
          <span>소비 {formatAmount(total)}원</span>
        </div>
        <div className="relative pt-7">
          {pace?.isCurrentPeriod && (
            <BudgetTodayMarker dayPct={pace.dayPct} clampedDayPct={pace.clampedDayPct} label />
          )}
          <div className="h-2 bg-[var(--color-surface-sub)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${budgetPct}%`, backgroundColor: budgetPct >= 100 ? 'var(--color-expense)' : pace?.isCurrentPeriod && pace.spendPct > pace.dayPct + 5 ? 'var(--color-warning)' : 'var(--color-primary)' }}
            />
          </div>
        </div>
        {pace?.isCurrentPeriod && (
          <div className="flex justify-between mt-2 text-[12px] text-[var(--color-text-sub)]">
            <span>월 진행 {pace.dayPct.toFixed(0)}%</span>
            <span>월말 예상 {formatAmount(pace.projectedSpend)}원</span>
          </div>
        )}
        <div className="flex justify-between mt-2 text-[12px]">
          <span className="text-[var(--color-text-sub)]">소진율 {budgetPct.toFixed(1)}%</span>
          <span className={total > totalBudget ? 'text-[var(--color-expense)]' : 'text-[var(--color-income)]'}>
            {total > totalBudget ? `초과 ${formatAmount(total - totalBudget)}원` : `잔여 ${formatAmount(totalBudget - total)}원`}
          </span>
        </div>
      </div>

      {/* 카테고리별 */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-[0px_2px_8px_rgba(0,0,0,0.08)] divide-y divide-[var(--color-border)]">
        {stats.map(({ cat, budget, spent, isDirect, pct, over }) => (
          <div key={cat.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <CatIcon icon={cat.icon || '📦'} id={cat.id} size={28} />
                <span className="text-[14px] text-[var(--color-text)]">{cat.name}</span>
                {!isDirect && (
                  <span className="text-[10px] text-[var(--color-text-placeholder)] bg-[var(--color-surface-sub)] px-1.5 py-0.5 rounded">
                    이전 달 기준
                  </span>
                )}
              </div>
              <span className={`text-[12px] font-semibold tabular-nums ${over ? 'text-[var(--color-expense)]' : 'text-[var(--color-text-sub)]'}`}>
                {over ? `초과 ${formatAmount(spent - budget)}원` : `잔여 ${formatAmount(budget - spent)}원`}
              </span>
            </div>
            <div className="relative">
              {pace?.isCurrentPeriod && budget > 0 && (
                <BudgetTodayMarker dayPct={pace.dayPct} clampedDayPct={pace.clampedDayPct} />
              )}
              <div className="h-1.5 bg-[var(--color-surface-sub)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: over ? 'var(--color-expense)' : categoryColor(cat.id) }}
                />
              </div>
            </div>
            <div className="flex justify-between mt-1 text-[11px] text-[var(--color-text-placeholder)] tabular-nums">
              <span>{formatAmount(spent)}원 사용</span>
              <span>예산 {formatAmount(budget)}원</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ──────────────── 내용별 뷰 ──────────────── */

interface ContentStat {
  label: string
  count: number
  total: number
}

function ContentView({
  stats, contentType, setContentType, contentPeriod, setContentPeriod,
}: {
  stats: ContentStat[]
  contentType: ContentType
  setContentType: (v: ContentType) => void
  contentPeriod: ContentPeriod
  setContentPeriod: (v: ContentPeriod) => void
}) {
  return (
    <div className="pt-4">
      {/* 지출/수입 탭 */}
      <div className="flex px-4 gap-2 mb-3">
        {(['income', 'expense'] as ContentType[]).map(t => (
          <button
            key={t}
            onClick={() => setContentType(t)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              contentType === t
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-sub)] text-[var(--color-text-sub)]'
            }`}
          >
            {t === 'expense' ? '지출' : '수입'}
          </button>
        ))}
      </div>

      {/* 기간 탭 */}
      <div className="flex px-4 gap-2 mb-4">
        {(['month', 'week', 'year'] as ContentPeriod[]).map(p => (
          <button
            key={p}
            onClick={() => setContentPeriod(p)}
            className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors ${
              contentPeriod === p
                ? 'bg-[var(--color-text)] text-[var(--color-surface)]'
                : 'bg-[var(--color-surface-sub)] text-[var(--color-text-sub)]'
            }`}
          >
            {p === 'month' ? '내용별' : p === 'week' ? '주별' : '연별'}
          </button>
        ))}
      </div>

      {stats.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-[var(--color-text-sub)] text-[14px]">
          {contentType === 'expense' ? '지출 내역이 없습니다' : '수입 내역이 없습니다'}
        </div>
      ) : (
        <div className="px-4 space-y-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-t-2xl shadow-[0px_2px_8px_rgba(0,0,0,0.08)]">
          {stats.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className="flex items-center justify-between py-3.5 border-b border-[var(--color-border)] last:border-0"
            >
              <div>
                <div className="text-[14px] text-[var(--color-text)]">{s.label}</div>
                <div className="text-[12px] text-[var(--color-text-sub)] mt-0.5">{s.count}건</div>
              </div>
              <div
                className={`text-[15px] font-semibold tabular-nums ${
                  contentType === 'expense' ? 'text-[var(--color-expense)]' : 'text-[var(--color-income)]'
                }`}
              >
                {formatAmount(s.total)}원
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
