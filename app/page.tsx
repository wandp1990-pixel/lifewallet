'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowUpDown, Repeat, Search, Plus } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Transaction, RecurringTransaction } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import { getMonthStartDay, getMonthRange } from '@/lib/monthStart'
import ListTab from '@/components/ledger/ListTab'
import CalendarTab from '@/components/ledger/CalendarTab'
import MonthlyTab from '@/components/ledger/MonthlyTab'

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
  const [monthStartDay, setMonthStartDay] = useState(1)
  const [view, setView] = useState<ViewType>('list')
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [assetFilter, setAssetFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sort, setSort] = useState<SortType>('newest')
  const [searchOpen, setSearchOpen] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [recurringList, setRecurringList] = useState<RecurringTransaction[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)

  // 월별 탭 전용: 연도 단위 탐색 + 연간 거래 데이터
  const [yearlyYear, setYearlyYear] = useState(now.getFullYear())
  const [yearlyTransactions, setYearlyTransactions] = useState<Transaction[]>([])
  const [yearlyLoading, setYearlyLoading] = useState(false)

  useEffect(() => { setMonthStartDay(getMonthStartDay()) }, [])

  const loanAssetIds = new Set(assets.filter(a => a.group_type === 'loan').map(a => a.id))

  const fetchTransactions = useCallback(async (y: number, m: number, startDay: number) => {
    setLoading(true)
    try {
      const { from, to } = getMonthRange(y, m, startDay)
      const res = await fetch(`/api/transactions?from=${from}&to=${to}`)
      const data = await res.json()
      setTransactions(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTransactions(year, month, monthStartDay) }, [year, month, monthStartDay, fetchTransactions])

  useEffect(() => {
    fetch('/api/recurring')
      .then(r => r.json())
      .then((data: RecurringTransaction[]) => setRecurringList(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // 월별 탭 활성 시 연간 거래 데이터 fetch
  useEffect(() => {
    if (view !== 'monthly') return
    const { from: yearFrom } = getMonthRange(yearlyYear, 1, monthStartDay)
    const { to: yearTo } = getMonthRange(yearlyYear, 12, monthStartDay)
    setYearlyLoading(true)
    fetch(`/api/transactions?from=${yearFrom}&to=${yearTo}`)
      .then(r => r.json())
      .then(data => setYearlyTransactions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setYearlyLoading(false))
  }, [view, yearlyYear, monthStartDay])

  const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const pendingRecurring = recurringList.filter(r => r.enabled && r.last_applied_month !== currentMonthKey)

  async function applyRecurring(r: RecurringTransaction) {
    setApplyingId(r.id)
    try {
      const res = await fetch(`/api/recurring/${r.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonthKey }),
      })
      if (res.ok) {
        const { transaction } = await res.json()
        setTransactions(prev => [transaction, ...prev])
        setRecurringList(prev => prev.map(x => x.id === r.id ? { ...x, last_applied_month: currentMonthKey } : x))
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
    return t.type === 'transfer' && loanAssetIds.has(t.from_asset_id)
  }

  function txMatchesAsset(t: Transaction, assetId: string): boolean {
    return t.asset_id === assetId || t.from_asset_id === assetId || t.to_asset_id === assetId
  }

  const visible = transactions.filter(t => t.type !== 'asset')

  const incomeCount = visible.filter(t => t.type === 'income').length
  const income = visible.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenseCount = visible.filter(t => t.type === 'expense').length
  const expense = visible.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const transferCount = visible.filter(t => t.type === 'transfer' && !isLoanReceived(t)).length
  const transfer = visible.filter(t => t.type === 'transfer' && !isLoanReceived(t)).reduce((s, t) => s + t.amount, 0)
  const loanRepaymentCount = visible.filter(t => t.type === 'loan_repayment').length
  const loanRepayment = visible.filter(t => t.type === 'loan_repayment').reduce((s, t) => s + t.amount, 0)
  const loanReceivedCount = visible.filter(isLoanReceived).length
  const loanReceived = visible.filter(isLoanReceived).reduce((s, t) => s + t.amount, 0)
  const netFlow = income - expense - loanRepayment

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
    setTransactions(prev => prev.filter(t => t.id !== id))
  }

  const usedAssetIds = new Set(visible.flatMap(t => [t.asset_id, t.from_asset_id, t.to_asset_id].filter(Boolean)))
  const filterableAssets = assets.filter(a => usedAssetIds.has(a.id))
  const filterableCategories = categories.filter(c => visible.some(t => t.category_id === c.id))

  // 요약 탭 - 카테고리별 지출
  const catExpense: Record<string, number> = {}
  for (const t of visible.filter(t => t.type === 'expense')) {
    catExpense[t.category_id] = (catExpense[t.category_id] ?? 0) + t.amount
  }

  return (
    <div className="flex flex-col h-full">
      {/* 고정 헤더 */}
      <div className="shrink-0 bg-[var(--color-surface)] z-10">

        {/* 타이틀 바 */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
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
              className="w-full rounded-xl bg-[var(--color-surface-sub)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex gap-2">
              <select
                value={assetFilter}
                onChange={e => setAssetFilter(e.target.value)}
                className="flex-1 min-w-0 rounded-xl bg-[var(--color-surface-sub)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] outline-none"
              >
                <option value="">모든 자산</option>
                {filterableAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="flex-1 min-w-0 rounded-xl bg-[var(--color-surface-sub)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] outline-none"
              >
                <option value="">모든 분류</option>
                {filterableCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* 월/연도 이동 — 월별 탭은 연도 단위 */}
        <div className="flex items-center justify-center gap-4 py-2">
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
              className={`flex-1 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                view === tab.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-sub)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 타입 필터 탭 — 일일에서만 */}
        {view === 'list' && (
          <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-t border-[var(--color-border)]">
            {(Object.keys(FILTER_LABELS) as FilterType[]).map(f => {
              const count = countByFilter(f)
              if (f !== 'all' && count === 0) return null
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium transition-colors border-b-2 ${
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
        {view !== 'monthly' && <div className="mx-4 mt-2 mb-2 bg-[var(--color-surface)] rounded-2xl px-4 py-3 border border-[var(--color-border)] shadow-[0px_1px_6px_rgba(0,0,0,0.06)]">
        <div className="flex items-baseline justify-between mb-2">
          <p className={`text-[22px] font-bold tabular-nums leading-tight ${netFlow >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
            {netFlow >= 0 ? '+' : ''}{new Intl.NumberFormat('ko-KR').format(netFlow)}원
          </p>
          <p className="text-[11px] text-[var(--color-text-sub)]">{month}월 합계</p>
        </div>
        {(income + expense) > 0 ? (
          <div className="h-[5px] rounded-full overflow-hidden flex mb-2">
            <div
              style={{ width: `${Math.round(income / (income + expense) * 100)}%` }}
              className="bg-[var(--color-income)]"
            />
            <div className="flex-1 bg-[var(--color-expense)]" />
          </div>
        ) : (
          <div className="h-[5px] rounded-full bg-[var(--color-surface-sub)] mb-2" />
        )}
        <div className="flex justify-between text-[12px]">
          <span className="text-[var(--color-text-sub)]">
            ■ 수입 <span className="font-semibold text-[var(--color-income)]">{formatAmount(income)}원</span>
          </span>
          <span className="text-[var(--color-text-sub)]">
            ■ 지출 <span className="font-semibold text-[var(--color-expense)]">{formatAmount(expense)}원</span>
          </span>
        </div>
        </div>}

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
                <p className="text-[11px] text-[var(--color-text-sub)]">매월 {r.day_of_month}일 · {formatAmount(r.amount)}원</p>
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
      <div className="flex-1 overflow-y-auto pb-[var(--bottom-nav-total)] md:pb-0">
      {/* 탭 콘텐츠 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
          <p className="text-sm">불러오는 중…</p>
        </div>
      ) : view === 'list' ? (
        <ListTab transactions={filtered} categories={categories} assets={assets} onDelete={handleDelete} />
      ) : view === 'calendar' ? (
        <CalendarTab year={year} month={month} transactions={transactions} onSelectDate={() => setView('list')} />
      ) : view === 'monthly' ? (
        <MonthlyTab year={yearlyYear} transactions={yearlyTransactions} monthStartDay={monthStartDay} loading={yearlyLoading} />
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
                <p className="text-[13px] font-semibold text-[var(--color-text-sub)]">카테고리별 지출</p>
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
      <div className="fixed right-4 z-40 md:hidden" style={{ bottom: 'calc(var(--bottom-nav-total) + 16px)' }}>
        <Link
          href="/transaction/new"
          className="w-14 h-14 rounded-full bg-[var(--color-primary)] flex items-center justify-center shadow-[0px_4px_16px_rgba(49,130,246,0.4)] active:scale-95 transition-transform"
        >
          <Plus size={24} className="text-white" />
        </Link>
      </div>
    </div>
  )
}
