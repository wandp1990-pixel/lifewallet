'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowUpDown, Repeat } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Transaction, RecurringTransaction } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import ListTab from '@/components/ledger/ListTab'
import CalendarTab from '@/components/ledger/CalendarTab'

type ViewType = 'list' | 'calendar'
type FilterType = 'all' | 'income' | 'expense' | 'transfer' | 'loan_repayment' | 'loan_received'
type SortType = 'newest' | 'oldest'

const FILTER_LABELS: Record<FilterType, string> = {
  all: '전체',
  income: '수입',
  expense: '지출',
  transfer: '이체',
  loan_repayment: '대출 상환',
  loan_received: '대출 수령',
}

export default function LedgerPage() {
  const { categories, assets } = useStore()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [view, setView] = useState<ViewType>('list')
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [assetFilter, setAssetFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sort, setSort] = useState<SortType>('newest')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [recurringList, setRecurringList] = useState<RecurringTransaction[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const loanAssetIds = new Set(assets.filter(a => a.group_type === 'loan').map(a => a.id))

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

  useEffect(() => {
    fetchTransactions(year, month)
  }, [year, month, fetchTransactions])

  useEffect(() => {
    fetch('/api/recurring')
      .then(r => r.json())
      .then((data: RecurringTransaction[]) => setRecurringList(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`
  const pendingRecurring = recurringList.filter(
    r => r.enabled && r.last_applied_month !== currentMonthKey
  )

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

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  // asset 타입은 가계부에서 노출하지 않음
  const visible = transactions.filter(t => t.type !== 'asset')

  function isLoanReceived(t: Transaction) {
    return t.type === 'transfer' && loanAssetIds.has(t.from_asset_id)
  }

  function txMatchesAsset(t: Transaction, assetId: string): boolean {
    return t.asset_id === assetId || t.from_asset_id === assetId || t.to_asset_id === assetId
  }

  // 요약 집계 (필터 무관, 항상 전체 월 기준)
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

  // 필터별 건수 (타입 필터용)
  function countByFilter(f: FilterType): number {
    if (f === 'all') return visible.length
    if (f === 'loan_received') return loanReceivedCount
    if (f === 'transfer') return transferCount
    if (f === 'loan_repayment') return loanRepaymentCount
    if (f === 'income') return incomeCount
    if (f === 'expense') return expenseCount
    return 0
  }

  // 타입 필터 → 자산 필터 → 분류 필터 → 검색 → 정렬 적용
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

  function handleCalendarSelectDate(_date: string) {
    setFilter('all')
    setView('list')
  }

  // 자산 필터 드롭다운용 - 해당 월 거래에 등장하는 자산만
  const usedAssetIds = new Set(visible.flatMap(t => [t.asset_id, t.from_asset_id, t.to_asset_id].filter(Boolean)))
  const filterableAssets = assets.filter(a => usedAssetIds.has(a.id))

  // 분류 필터 드롭다운용 - expense/income 카테고리만
  const filterableCategories = categories.filter(c =>
    visible.some(t => t.category_id === c.id)
  )

  return (
    <div className="flex flex-col min-h-full">
      {/* 고정 헤더 */}
      <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">

        {/* 상단: 뷰 탭 / 월 이동 / 내역 추가 */}
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <div className="flex gap-1 shrink-0">
            {(['list', 'calendar'] as ViewType[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === v
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sub)]'
                }`}
              >
                {v === 'list' ? '목록' : '달력'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)] transition-colors">
              <ChevronLeft size={18} className="text-[var(--color-text-sub)]" />
            </button>
            <span className="text-[15px] font-semibold text-[var(--color-text)] min-w-[84px] text-center">
              {year}년 {month}월
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)] transition-colors">
              <ChevronRight size={18} className="text-[var(--color-text-sub)]" />
            </button>
            {!isCurrentMonth && (
              <button
                onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }}
                className="ml-1 px-2 py-1 text-xs text-[var(--color-primary)] rounded-lg hover:bg-[var(--color-surface-sub)] transition-colors"
              >
                이번 달
              </button>
            )}
          </div>

          <Link
            href="/transaction/new"
            className="shrink-0 px-3 py-1.5 bg-[var(--color-primary)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            + 내역 추가
          </Link>
        </div>

        {/* 요약 바 */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-px bg-[var(--color-border)] border-t border-[var(--color-border)]">
          {/* 순흐름 */}
          <div className="bg-[var(--color-surface)] px-3 py-2.5">
            <p className="text-[11px] text-[var(--color-text-sub)]">{month}월 순흐름 · {visible.length}건</p>
            <p className={`text-[17px] font-bold mt-0.5 ${netFlow >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
              {netFlow >= 0 ? '+' : '-'}{formatAmount(Math.abs(netFlow))}원
            </p>
          </div>
          {/* 수입 */}
          <div className="bg-[var(--color-surface)] px-3 py-2.5">
            <p className="text-[11px] text-[var(--color-text-sub)]">● 수입 {incomeCount}</p>
            <p className="text-[15px] font-semibold text-[var(--color-income)] mt-0.5">+{formatAmount(income)}원</p>
          </div>
          {/* 지출 */}
          <div className="bg-[var(--color-surface)] px-3 py-2.5">
            <p className="text-[11px] text-[var(--color-text-sub)]">● 지출 {expenseCount}</p>
            <p className="text-[15px] font-semibold text-[var(--color-expense)] mt-0.5">-{formatAmount(expense)}원</p>
          </div>
          {/* 이체 */}
          {transferCount > 0 && (
            <div className="bg-[var(--color-surface)] px-3 py-2.5">
              <p className="text-[11px] text-[var(--color-text-sub)]">● 이체 {transferCount}</p>
              <p className="text-[15px] font-semibold text-[var(--color-text)] mt-0.5">{formatAmount(transfer)}원</p>
            </div>
          )}
          {/* 대출상환 */}
          {loanRepaymentCount > 0 && (
            <div className="bg-[var(--color-surface)] px-3 py-2.5">
              <p className="text-[11px] text-[var(--color-text-sub)]">● 대출상환 {loanRepaymentCount}</p>
              <p className="text-[15px] font-semibold text-[var(--color-expense)] mt-0.5">-{formatAmount(loanRepayment)}원</p>
            </div>
          )}
          {/* 대출수령 */}
          {loanReceivedCount > 0 && (
            <div className="bg-[var(--color-surface)] px-3 py-2.5">
              <p className="text-[11px] text-[var(--color-text-sub)]">● 대출수령 {loanReceivedCount}</p>
              <p className="text-[15px] font-semibold text-[var(--color-text)] mt-0.5">{formatAmount(loanReceived)}원</p>
            </div>
          )}
        </div>

        {/* 타입 필터 탭 */}
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-t border-[var(--color-border)]">
          {(Object.keys(FILTER_LABELS) as FilterType[]).map(f => {
            const count = countByFilter(f)
            if (f !== 'all' && count === 0) return null
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                  filter === f
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-sub)] hover:text-[var(--color-text)]'
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

        {/* 검색 + 자산/분류 필터 + 정렬 */}
        <div className="flex gap-2 px-4 pb-3 pt-1 border-t border-[var(--color-border)] overflow-x-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="내용·메모 검색"
            className="flex-1 min-w-[140px] rounded-xl bg-[var(--color-surface-sub)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
          />
          <select
            value={assetFilter}
            onChange={e => setAssetFilter(e.target.value)}
            className="shrink-0 rounded-xl bg-[var(--color-surface-sub)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] outline-none"
          >
            <option value="">모든 자산</option>
            {filterableAssets.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="shrink-0 rounded-xl bg-[var(--color-surface-sub)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] outline-none"
          >
            <option value="">모든 분류</option>
            {filterableCategories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          <button
            onClick={() => setSort(s => s === 'newest' ? 'oldest' : 'newest')}
            className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-[var(--color-surface-sub)] border border-[var(--color-border)] text-sm text-[var(--color-text-sub)] hover:text-[var(--color-text)] transition-colors"
          >
            <ArrowUpDown size={14} />
            {sort === 'newest' ? '최신순' : '오래된순'}
          </button>
        </div>
      </div>

      {/* 반복 거래 미적용 배너 — 이번 달 조회 시에만 표시 */}
      {isCurrentMonth && pendingRecurring.length > 0 && (
        <div className="mx-4 mt-3 rounded-2xl border border-[var(--color-primary)] bg-[var(--color-primary)]/5 p-3 space-y-2">
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

      {/* 본문 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
          <p className="text-sm">불러오는 중…</p>
        </div>
      ) : view === 'list' ? (
        <ListTab
          transactions={filtered}
          categories={categories}
          assets={assets}
          onDelete={handleDelete}
        />
      ) : (
        <CalendarTab
          year={year}
          month={month}
          transactions={transactions}
          onSelectDate={handleCalendarSelectDate}
        />
      )}
    </div>
  )
}
