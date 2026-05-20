'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Transaction, Category, Budget } from '@/lib/types'
import { categoryColor } from '@/lib/colors'
import { formatAmount } from '@/lib/utils'

type StatView = 'category' | 'budget' | 'content'
type ContentType = 'expense' | 'income'
type ContentPeriod = 'month' | 'week' | 'year'

const VIEW_LABELS: Record<StatView, string> = {
  category: '카테고리별',
  budget: '예산',
  content: '내용별',
}

function getBudgetForMonth(budgets: Budget[], categoryId: string, year: number, month: number): number {
  // 해당 월 직접 설정값 먼저
  const direct = budgets.find(b => b.year === year && b.month === month && b.category_id === categoryId)
  if (direct) return direct.amount

  // 이전 달로 거슬러 올라가 최대 24개월
  let y = year
  let m = month - 1
  for (let i = 0; i < 24; i++) {
    if (m < 1) { m = 12; y-- }
    const found = budgets.find(b => b.year === y && b.month === m && b.category_id === categoryId)
    if (found) return found.amount
    m--
  }
  return 0
}

function isDirectBudget(budgets: Budget[], categoryId: string, year: number, month: number): boolean {
  return budgets.some(b => b.year === year && b.month === month && b.category_id === categoryId)
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
  const [view, setView] = useState<StatView>('category')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [contentType, setContentType] = useState<ContentType>('expense')
  const [contentPeriod, setContentPeriod] = useState<ContentPeriod>('month')

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const fetchTransactions = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/transactions?year=${y}&month=${m}`)
      const data = await res.json()
      setTransactions(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTransactions(year, month) }, [year, month, fetchTransactions])

  const expenseCategories = useMemo(
    () => categories.filter(c => c.type === 'expense').sort((a, b) => a.order - b.order),
    [categories]
  )

  const totalIncome = useMemo(
    () => transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [transactions]
  )
  const totalExpense = useMemo(
    () => transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    [transactions]
  )

  // 카테고리별 지출 집계
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      const key = t.category_id || ''
      map[key] = (map[key] ?? 0) + t.amount
    }
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
    return entries.map(([categoryId, amount]) => {
      const cat = categories.find(c => c.id === categoryId)
      return {
        categoryId,
        name: cat ? `${cat.icon} ${cat.name}` : '미분류',
        amount,
        pct: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
        color: categoryColor(categoryId),
      }
    })
  }, [transactions, categories, totalExpense])

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

  // 내용별 집계
  const contentStats = useMemo(() => {
    const filtered = transactions.filter(t => t.type === contentType)
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
  }, [transactions, contentType, contentPeriod])

  if (!ready) return null

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={prevMonth} className="p-1 text-[var(--color-text-sub)]">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-[var(--color-text)]">{year}년 {month}월</div>
            <div className="flex gap-4 mt-0.5 text-[12px]">
              <span className="text-[var(--color-income)]">수입 {formatAmount(totalIncome)}원</span>
              <span className="text-[var(--color-expense)]">지출 {formatAmount(totalExpense)}원</span>
            </div>
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
        {loading ? (
          <div className="flex justify-center py-16 text-[var(--color-text-sub)] text-sm">
            불러오는 중…
          </div>
        ) : (
          <>
            {view === 'category' && <CategoryView stats={categoryStats} total={totalExpense} />}
            {view === 'budget' && (
              <BudgetView
                stats={budgetStats}
                total={totalExpense}
                totalBudget={totalBudget}
                budgetPct={budgetPct}
                year={year}
                month={month}
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
  amount: number
  pct: number
  color: string
}

function CategoryView({ stats, total }: { stats: CategoryStat[]; total: number }) {
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-[15px]">이번 달 지출 내역이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 space-y-1">
      {/* 색상 막대 시각화 */}
      <div className="flex h-3 rounded-full overflow-hidden mb-4">
        {stats.map(s => (
          <div
            key={s.categoryId}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
            title={s.name}
          />
        ))}
      </div>

      {stats.map(s => (
        <div key={s.categoryId} className="flex items-center gap-3 py-3 border-b border-[var(--color-border)] last:border-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
          <span className="flex-1 text-[14px] text-[var(--color-text)] truncate">{s.name}</span>
          <span className="text-[13px] text-[var(--color-text-sub)] w-10 text-right tabular-nums">
            {s.pct.toFixed(1)}%
          </span>
          <span className="text-[14px] font-semibold text-[var(--color-text)] tabular-nums w-28 text-right">
            {formatAmount(s.amount)}원
          </span>
        </div>
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
  stats, total, totalBudget, budgetPct, year, month,
}: {
  stats: BudgetStat[]
  total: number
  totalBudget: number
  budgetPct: number
  year: number
  month: number
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
      <div className="bg-[var(--color-surface)] rounded-2xl p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.08)]">
        <div className="flex justify-between text-[13px] text-[var(--color-text-sub)] mb-2">
          <span>총 예산 {formatAmount(totalBudget)}원</span>
          <span>사용 {formatAmount(total)}원</span>
        </div>
        <div className="h-2 bg-[var(--color-surface-sub)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${budgetPct}%`, backgroundColor: budgetPct >= 100 ? 'var(--color-expense)' : 'var(--color-primary)' }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[12px]">
          <span className="text-[var(--color-text-sub)]">소진율 {budgetPct.toFixed(1)}%</span>
          <span className={total > totalBudget ? 'text-[var(--color-expense)]' : 'text-[var(--color-income)]'}>
            {total > totalBudget ? `초과 ${formatAmount(total - totalBudget)}원` : `잔여 ${formatAmount(totalBudget - total)}원`}
          </span>
        </div>
        <div className="mt-3 flex justify-end">
          <Link
            href={`/statistics/budget-settings?year=${year}&month=${month}`}
            className="text-[12px] text-[var(--color-primary)]"
          >
            예산 편집 →
          </Link>
        </div>
      </div>

      {/* 카테고리별 */}
      <div className="bg-[var(--color-surface)] rounded-2xl shadow-[0px_2px_8px_rgba(0,0,0,0.08)] divide-y divide-[var(--color-border)]">
        {stats.map(({ cat, budget, spent, isDirect, pct, over }) => (
          <div key={cat.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: categoryColor(cat.id) }} />
                <span className="text-[14px] text-[var(--color-text)]">{cat.icon} {cat.name}</span>
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
            <div className="h-1.5 bg-[var(--color-surface-sub)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: over ? 'var(--color-expense)' : categoryColor(cat.id) }}
              />
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
        {(['expense', 'income'] as ContentType[]).map(t => (
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
        <div className="px-4 space-y-0 bg-[var(--color-surface)] rounded-t-2xl shadow-[0px_2px_8px_rgba(0,0,0,0.08)]">
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
