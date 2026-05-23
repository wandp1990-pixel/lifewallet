'use client'

import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, ArrowUpDown, Repeat, Search, Plus } from 'lucide-react'
import { useStore } from '@/lib/store'
import { getExpenseAmount, getOutflowAmount, isLoanReceivedTransaction } from '@/lib/finance'
import type { Transaction, RecurringTransaction } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import { getDisplayMonth, getMonthStartDay, getMonthRange } from '@/lib/monthStart'
import { fetcher } from '@/lib/fetcher'
import ListTab from '@/components/ledger/ListTab'
import CalendarTab from '@/components/ledger/CalendarTab'
import MonthlyTab from '@/components/ledger/MonthlyTab'
import { SkeletonCard, SkeletonSummaryCard } from '@/components/ui/Skeleton'
import AddTransactionSheet from '@/components/transaction/AddTransactionSheet'

type ViewType = 'list' | 'calendar' | 'monthly' | 'summary' | 'memo'
type FilterType = 'all' | 'income' | 'expense' | 'transfer' | 'loan_repayment' | 'loan_received'
type SortType = 'newest' | 'oldest'

const FILTER_LABELS: Record<FilterType, string> = {
  all: '전체', income: '수입', expense: '지출',
  transfer: '이체', loan_repayment: '대출 상환', loan_received: '대출 수령',
}

const TABS: { id: ViewType; label: string }[] = [
  { id: 'list', label: '일일' },
  { id: 'calendar', label: '달력' },
  { id: 'monthly', label: '월별' },
  { id: 'summary', label: '요약' },
  { id: 'memo', label: '메모' },
]


export default function LedgerPage() {
  const { categories, assets } = useStore()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [monthStartDay, setMonthStartDay] = useState<number | null>(null)
  const [view, setView] = useState<ViewType>('list')
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [assetFilter, setAssetFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sort, setSort] = useState<SortType>('newest')
  const [searchOpen, setSearchOpen] = useState(false)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [editSheetTx, setEditSheetTx] = useState<Transaction | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  // 월별 탭 전용: 연도 단위 탐색 + 연간 거래 데이터
  const [yearlyYear, setYearlyYear] = useState(now.getFullYear())

  useEffect(() => {
    const startDay = getMonthStartDay()
    const displayMonth = getDisplayMonth(new Date(), startDay)
    setMonthStartDay(startDay)
    setYear(displayMonth.year)
    setMonth(displayMonth.month)
    setYearlyYear(displayMonth.year)
  }, [])

  const txUrl = useMemo(() => {
    if (monthStartDay === null) return null
    const { from, to } = getMonthRange(year, month, monthStartDay)
    return `/api/transactions?from=${from}&to=${to}`
  }, [year, month, monthStartDay])

  const yearlyUrl = useMemo(() => {
    if (view !== 'monthly' || monthStartDay === null) return null
    const { from } = getMonthRange(yearlyYear, 1, monthStartDay)
    const { to } = getMonthRange(yearlyYear, 12, monthStartDay)
    return `/api/transactions?from=${from}&to=${to}`
  }, [view, yearlyYear, monthStartDay])

  const { data: transactions = [], isLoading: loading, mutate: mutateTx } = useSWR<Transaction[]>(txUrl, fetcher)
  const { data: yearlyTransactions = [], isLoading: yearlyLoading } = useSWR<Transaction[]>(yearlyUrl, fetcher)
  const { data: recurringRaw, mutate: mutateRecurring } = useSWR<RecurringTransaction[]>('/api/recurring', fetcher)
  const recurringList = recurringRaw ?? []

  const currentDisplayMonth = monthStartDay === null
    ? { year: now.getFullYear(), month: now.getMonth() + 1 }
    : getDisplayMonth(now, monthStartDay)
  const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`
  const isCurrentMonth = year === currentDisplayMonth.year && month === currentDisplayMonth.month
  const pendingRecurring = recurringList.filter(r => r.enabled && r.last_applied_month !== currentMonthKey)

  async function applyRecurring(r: RecurringTransaction) {
    setApplyingId(r.id)
    try {
      const res = await fetch(`/api/recurring/${r.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonthKey, month_start_day: monthStartDay ?? 1 }),
      })
      if (res.ok) {
        const { transaction } = await res.json()
        mutateTx((data) => [transaction, ...(data ?? [])], { revalidate: false })
        mutateRecurring(
          (data) => data?.map(x => x.id === r.id ? { ...x, last_applied_month: currentMonthKey } : x),
          { revalidate: false }
        )
      }
    } finally {
      setApplyingId(null)
    }
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }
  function prevYear() { setYearlyYear(y => y - 1) }
  function nextYear() { setYearlyYear(y => y + 1) }

  function isLoanReceived(t: Transaction) {
    return isLoanReceivedTransaction(t, assets)
  }

  function txMatchesAsset(t: Transaction, assetId: string): boolean {
    return t.asset_id === assetId || t.from_asset_id === assetId || t.to_asset_id === assetId
  }

  const visible = transactions.filter(t => t.type !== 'asset')

  const incomeCount = visible.filter(t => t.type === 'income').length
  const income = visible.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenseCount = visible.filter(t => t.type === 'expense').length
  const expense = getExpenseAmount(visible)
  const outflow = getOutflowAmount(visible)
  const transferCount = visible.filter(t => t.type === 'transfer' && !isLoanReceived(t)).length
  const transfer = visible.filter(t => t.type === 'transfer' && !isLoanReceived(t)).reduce((s, t) => s + t.amount, 0)
  const loanRepaymentCount = visible.filter(t => t.type === 'loan_repayment').length
  const loanRepayment = visible.filter(t => t.type === 'loan_repayment').reduce((s, t) => s + t.amount, 0)
  const loanReceivedCount = visible.filter(isLoanReceived).length
  const loanReceived = visible.filter(isLoanReceived).reduce((s, t) => s + t.amount, 0)
  const netFlow = income - outflow
  const summaryGaugeTotal = income > 0 ? income : outflow
  const remainingPct = summaryGaugeTotal > 0 ? Math.max(0, Math.min(100, Math.max(0, netFlow) / summaryGaugeTotal * 100)) : 0
  const expensePct = summaryGaugeTotal > 0 ? Math.max(0, Math.min(100 - remainingPct, expense / summaryGaugeTotal * 100)) : 0
  const loanRepaymentPct = summaryGaugeTotal > 0 ? Math.max(0, Math.min(100 - remainingPct - expensePct, loanRepayment / summaryGaugeTotal * 100)) : 0

  function countByFilter(f: FilterType): number {
    if (f === 'all') return visible.length
    if (f === 'loan_received') return loanReceivedCount
    if (f === 'transfer') return transferCount
    if (f === 'loan_repayment') return loanRepaymentCount
    if (f === 'income') return incomeCount
    if (f === 'expense') return expenseCount
    return 0
  }

  const filtered = visible
    .filter(t => {
      if (filter === 'loan_received') return isLoanReceived(t)
      if (filter === 'transfer') return t.type === 'transfer' && !isLoanReceived(t)
      if (filter !== 'all') return t.type === filter
      return true
    })
    .filter(t => !assetFilter || txMatchesAsset(t, assetFilter))
    .filter(t => !categoryFilter || t.category_id === categoryFilter)
    .filter(t => {
      if (!search.trim()) return true
      const q = search.trim()
      return t.content.includes(q) || t.note.includes(q)
    })
    .sort((a, b) =>
      sort === 'newest'
        ? b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)
        : a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)
    )

  function handleDelete(id: string) {
    mutateTx((data) => data?.filter(t => t.id !== id) ?? [], { revalidate: false })
  }

  const usedAssetIds = new Set(visible.flatMap(t => [t.asset_id, t.from_asset_id, t.to_asset_id].filter(Boolean)))
  const filterableAssets = assets.filter(a => usedAssetIds.has(a.id))
  const filterableCategories = categories.filter(c => c.visible && visible.some(t => t.category_id === c.id))

  // 요약 탭 - 소비 카테고리별 지출
  const catExpense: Record<string, number> = {}
  for (const t of visible.filter(t => t.type === 'expense')) {
    catExpense[t.category_id] = (catExpense[t.category_id] ?? 0) + t.amount
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 고정 헤더 */}
      <div className="z-10 shrink-0 touch-none select-none overscroll-none bg-[var(--color-surface)]">

        {/* 타이틀 바 */}
        <div className="flex items-center justify-between px-4 h-[44px]">
          <button
            onClick={() => setSearchOpen(v => !v)}
            className="p-2 -ml-2 rounded-xl hover:bg-[var(--color-surface-sub)] transition-colors"
          >
            <Search size={20} className={searchOpen ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-sub)]'} />
          </button>
          <h1 className="text-[17px] font-bold text-[var(--color-text)]">가계부</h1>
          <button
            onClick={() => setSort(s => s === 'newest' ? 'oldest' : 'newest')}
            className="p-2 -mr-2 rounded-xl hover:bg-[var(--color-surface-sub)] transition-colors"
            title={sort === 'newest' ? '최신순' : '오래된순'}
          >
            <ArrowUpDown size={18} className="text-[var(--color-text-sub)]" />
          </button>
        </div>

        {/* 검색/필터 패널 */}
        {searchOpen && (
          <div className="px-4 pb-3 pt-2 space-y-2 border-t border-[var(--color-border)]">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="내용·메모 검색"
              autoFocus
              className="tds-field !py-2.5"
            />
            <div className="flex gap-2">
              <select
                value={assetFilter}
                onChange={e => setAssetFilter(e.target.value)}
                className="tds-field flex-1 min-w-0 !py-2.5"
              >
                <option value="">모든 자산</option>
                {filterableAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="tds-field flex-1 min-w-0 !py-2.5"
              >
                <option value="">모든 분류</option>
                {filterableCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* 월/연도 이동 — 월별 탭은 연도 단위 */}
        <div className="flex items-center justify-center gap-4 h-[44px]">
          <button
            onClick={view === 'monthly' ? prevYear : prevMonth}
            className="p-1.5 rounded-xl hover:bg-[var(--color-surface-sub)] transition-colors"
          >
            <ChevronLeft size={20} className="text-[var(--color-text-sub)]" />
          </button>
          <span className="text-[17px] font-semibold text-[var(--color-text)]">
            {view === 'monthly' ? `${yearlyYear}년` : `${year}년 ${month}월`}
          </span>
          <button
            onClick={view === 'monthly' ? nextYear : nextMonth}
            className="p-1.5 rounded-xl hover:bg-[var(--color-surface-sub)] transition-colors"
          >
            <ChevronRight size={20} className="text-[var(--color-text-sub)]" />
          </button>
        </div>

        {/* 탭 바 */}
        <div className="flex border-t border-[var(--color-border)]">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`flex-1 h-[44px] text-[13px] font-medium border-b-2 transition-colors ${
                view === tab.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-sub)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 타입 필터 탭 — 일일에서만 / PC 전용 */}
        {view === 'list' && (
          <div className="hidden md:flex gap-1.5 px-4 py-1 overflow-x-auto border-t border-[var(--color-border)]">
            {(Object.keys(FILTER_LABELS) as FilterType[]).map(f => {
              const count = countByFilter(f)
              if (f !== 'all' && count === 0) return null
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 flex items-center gap-1 px-3 py-1 text-[13px] font-medium transition-colors border-b-2 ${
                    filter === f
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                      : 'border-transparent text-[var(--color-text-sub)]'
                  }`}
                >
                  {FILTER_LABELS[f]}
                  <span className={`text-xs ${filter === f ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-sub)]'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* 요약 카드 — 월별 탭은 MonthlyTab 내부에서 자체 렌더 */}
        {view !== 'monthly' && (
          <div className="px-4 py-3 bg-[var(--color-surface-sub)]">
            {loading ? (
              <SkeletonSummaryCard />
            ) : (
            <div className="bg-[var(--color-surface)] rounded-2xl h-20 border border-[var(--color-border)] shadow-[0px_2px_10px_rgba(0,0,0,0.06)] flex flex-col px-[18px] justify-center">
              <div className="flex items-start justify-between mb-[5px]">
                <p className={`text-[16px] font-bold tabular-nums leading-none ${netFlow >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
                  {netFlow >= 0 ? '+' : '-'}{formatAmount(Math.abs(netFlow))}원
                </p>
                <p className="text-[13px] text-[var(--color-text-sub)] -mt-0.5">{month}월 합계</p>
              </div>
              {summaryGaugeTotal > 0 ? (
                <div className="h-[7px] rounded-full overflow-hidden flex mb-[5px]">
                  {remainingPct > 0 && <div style={{ width: `${remainingPct}%` }} className="bg-[var(--color-income)]" />}
                  {expensePct > 0 && <div style={{ width: `${expensePct}%` }} className="bg-[var(--color-expense)]" />}
                  {loanRepaymentPct > 0 && <div style={{ width: `${loanRepaymentPct}%` }} className="bg-[var(--color-warning)]" />}
                  <div className="flex-1 bg-[var(--color-surface-sub)]" />
                </div>
              ) : (
                <div className="h-[7px] rounded-full bg-[var(--color-surface-sub)] mb-[5px]" />
              )}
              <div className="flex justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-[1px] bg-[var(--color-income)]" />
                  <span className="text-[10px] text-[var(--color-text-sub)]">수입</span>
                  <span className="text-[11px] font-semibold tabular-nums text-[var(--color-income)]">{formatAmount(income)}원</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-[1px] bg-[var(--color-expense)]" />
                  <span className="text-[10px] text-[var(--color-text-sub)]">지출</span>
                  <span className="text-[11px] font-semibold tabular-nums text-[var(--color-expense)]">{formatAmount(expense)}원</span>
                </div>
                {loanRepayment > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-[1px] bg-[var(--color-warning)]" />
                    <span className="text-[10px] text-[var(--color-text-sub)]">상환</span>
                    <span className="text-[11px] font-semibold tabular-nums text-[var(--color-warning)]">{formatAmount(loanRepayment)}원</span>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {/* 반복 거래 배너 */}
        {view === 'list' && isCurrentMonth && pendingRecurring.length > 0 && (
          <div className="mx-4 mt-0 mb-2 rounded-2xl border border-[var(--color-primary)] bg-[var(--color-primary)]/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Repeat size={14} className="text-[var(--color-primary)]" />
            <p className="text-[13px] font-semibold text-[var(--color-primary)]">이번 달 미적용 반복 거래 {pendingRecurring.length}건</p>
          </div>
          {pendingRecurring.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-[var(--color-surface)] rounded-xl px-3 py-2">
              <div>
                <p className="text-[13px] font-medium text-[var(--color-text)]">{r.content}</p>
                <p className="text-[11px] text-[var(--color-text-sub)]">
                  매월 {r.day_of_month}일 · {formatAmount(r.amount)}원{r.type === 'loan_repayment' && r.fee > 0 ? ` · 이자 ${formatAmount(r.fee)}원` : ''}
                </p>
              </div>
              <button
                onClick={() => applyRecurring(r)}
                disabled={applyingId === r.id}
                className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-[12px] font-semibold disabled:opacity-50"
              >
                {applyingId === r.id ? '적용 중…' : '적용'}
              </button>
            </div>
          ))}
          </div>
        )}
      </div>

      {/* 스크롤 영역 — 탭 콘텐츠만 스크롤 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {/* 탭 콘텐츠 */}
      {loading ? (
        <div className="px-4 pt-3 pb-4 space-y-3">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={3} />
        </div>
      ) : view === 'list' ? (
        <ListTab transactions={filtered} categories={categories} assets={assets} onDelete={handleDelete} onEdit={tx => setEditSheetTx(tx)} />
      ) : view === 'calendar' ? (
        <CalendarTab year={year} month={month} monthStartDay={monthStartDay ?? 1} transactions={transactions} onSelectDate={() => setView('list')} />
      ) : view === 'monthly' ? (
        <MonthlyTab year={yearlyYear} transactions={yearlyTransactions} monthStartDay={monthStartDay ?? 1} loading={yearlyLoading} />
      ) : view === 'summary' ? (
        <div className="p-4 space-y-3">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <p className="text-[13px] font-semibold text-[var(--color-text-sub)]">유형별 합계</p>
            </div>
            {[
              { label: '수입', value: income, count: incomeCount, color: 'text-[var(--color-income)]', prefix: '+' },
              { label: '지출', value: expense, count: expenseCount, color: 'text-[var(--color-expense)]', prefix: '-' },
              ...(transferCount > 0 ? [{ label: '이체', value: transfer, count: transferCount, color: 'text-[var(--color-text)]', prefix: '' }] : []),
              ...(loanRepaymentCount > 0 ? [{ label: '대출상환', value: loanRepayment, count: loanRepaymentCount, color: 'text-[var(--color-expense)]', prefix: '-' }] : []),
              ...(loanReceivedCount > 0 ? [{ label: '대출수령', value: loanReceived, count: loanReceivedCount, color: 'text-[var(--color-text)]', prefix: '' }] : []),
            ].map(({ label, value, count, color, prefix }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0">
                <div>
                  <span className="text-[14px] text-[var(--color-text)]">{label}</span>
                  <span className="ml-2 text-[12px] text-[var(--color-text-sub)]">{count}건</span>
                </div>
                <span className={`text-[15px] font-semibold tabular-nums ${color}`}>{prefix}{formatAmount(value)}원</span>
              </div>
            ))}
          </div>
          {Object.keys(catExpense).length > 0 && (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <p className="text-[13px] font-semibold text-[var(--color-text-sub)]">소비 카테고리별 지출</p>
              </div>
              {Object.entries(catExpense)
                .sort(([, a], [, b]) => b - a)
                .map(([catId, amount]) => {
                  const cat = categories.find(c => c.id === catId)
                  return (
                    <div key={catId} className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0">
                      <span className="text-[14px] text-[var(--color-text)]">{cat?.icon} {cat?.name ?? '미분류'}</span>
                      <span className="text-[15px] font-semibold tabular-nums text-[var(--color-expense)]">-{formatAmount(amount)}원</span>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-sub)]">
          <p className="text-[15px] font-medium">준비 중입니다</p>
          <p className="text-sm mt-1">메모 기능이 곧 추가될 예정이에요</p>
        </div>
      )}
      </div>

      {/* FAB — 바텀 탭(60px) + safe area + 여백(16px) */}
      <div className="fixed right-4 z-40 md:hidden" style={{ bottom: 'calc(var(--bottom-nav-total) + var(--fab-gap))' }}>
        <button
          onClick={() => setAddSheetOpen(true)}
          className="h-[var(--fab-size)] w-[var(--fab-size)] rounded-full bg-[var(--color-primary)] flex items-center justify-center shadow-[0px_4px_16px_rgba(49,130,246,0.4)] active:scale-95 transition-transform"
        >
          <Plus size={20} className="text-white" />
        </button>
      </div>

      <AddTransactionSheet
        open={addSheetOpen || !!editSheetTx}
        mode={editSheetTx ? 'edit' : 'new'}
        initial={editSheetTx ?? undefined}
        transactionId={editSheetTx?.id}
        onClose={() => { setAddSheetOpen(false); setEditSheetTx(null) }}
        onSaved={() => { setEditSheetTx(null); mutateTx() }}
      />
    </div>
  )
}
