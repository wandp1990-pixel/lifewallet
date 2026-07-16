'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '@/lib/store'
import { getBudgetForMonth, isDirectBudget } from '@/lib/budget'
import { getDisplayMonth, getMonthStartDay } from '@/lib/monthStart'
import type { Budget } from '@/lib/types'
import { formatAmount } from '@/lib/utils'
import Link from 'next/link'
import CatIcon from '@/components/ui/CatIcon'
import AmountField from '@/components/ui/AmountField'

export default function BudgetSettings() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { categories, budgets, setBudget, deleteBudget, ready } = useStore()

  const now = new Date()
  const displayMonth = getDisplayMonth(now, getMonthStartDay())
  const initYear = Number(searchParams.get('year') || displayMonth.year)
  const initMonth = Number(searchParams.get('month') || displayMonth.month)

  const [year, setYear] = useState(initYear)
  const [month, setMonth] = useState(initMonth)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const expenseCategories = useMemo(
    () => categories.filter(c => c.type === 'expense' && c.visible).sort((a, b) => a.order - b.order),
    [categories]
  )

  // 월이 바뀌면 inputs 초기화
  useEffect(() => {
    if (!ready) return
    const init: Record<string, string> = {}
    for (const cat of expenseCategories) {
      if (cat.budget_excluded) continue
      if (isDirectBudget(budgets, cat.id, year, month)) {
        const b = budgets.find(b => b.year === year && b.month === month && b.category_id === cat.id)
        if (b) init[cat.id] = String(b.amount)
      }
    }
    setInputs(init)
  }, [year, month, ready, expenseCategories, budgets])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const toSave = Object.entries(inputs).filter(([, v]) => v.trim() !== '')
      const toDelete = expenseCategories
        .filter(cat => !cat.budget_excluded && isDirectBudget(budgets, cat.id, year, month) && (inputs[cat.id] ?? '').trim() === '')
        .map(cat => cat.id)

      await Promise.all(
        [
          ...toSave.map(async ([categoryId, v]) => {
            const amount = Number(v.replace(/,/g, ''))
            if (isNaN(amount) || amount < 0) throw new Error('invalid budget amount')
            const res = await fetch('/api/budget', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ year, month, category_id: categoryId, amount }),
            })
            if (!res.ok) throw new Error('save failed')
            const b: Budget = await res.json()
            setBudget(b)
          }),
          ...toDelete.map(async (categoryId) => {
            const res = await fetch('/api/budget', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ year, month, category_id: categoryId }),
            })
            if (!res.ok) throw new Error('delete failed')
            deleteBudget(year, month, categoryId)
          }),
        ]
      )
      showToast('예산을 저장했습니다')
    } catch {
      showToast('저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (!ready) return null

  if (expenseCategories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-[var(--color-text-sub)]">
        <p className="text-[15px]">지출 카테고리가 없습니다</p>
        <Link
          href="/settings/categories/expense"
          className="px-5 py-2.5 rounded-xl text-[14px] font-semibold text-[var(--color-primary)] border border-[var(--color-primary)]"
        >
          카테고리 관리로 이동
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[var(--color-surface)]">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sub)]" aria-label="뒤로">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-[16px] font-semibold text-[var(--color-text)] flex-1">예산 설정</h1>
        </div>
        <div className="flex items-center justify-center gap-4 pb-3">
          <button onClick={prevMonth} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sub)]" aria-label="이전 달">
            <ChevronLeft size={18} />
          </button>
          <span className="text-[15px] font-semibold text-[var(--color-text)]">{year}년 {month}월</span>
          <button onClick={nextMonth} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sub)]" aria-label="다음 달">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-36">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-[0px_2px_8px_rgba(0,0,0,0.08)] divide-y divide-[var(--color-border)]">
          {expenseCategories.map(cat => {
            const fallback = getBudgetForMonth(budgets, cat.id, year, month)
            const isDirect = isDirectBudget(budgets, cat.id, year, month)
            const inputVal = inputs[cat.id] ?? ''

            return (
              <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
                <CatIcon icon={cat.icon || 'box'} id={cat.id} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-[var(--color-text)]">{cat.name}</div>
                  {!isDirect && fallback > 0 && (
                    <div className="text-[11px] text-[var(--color-text-placeholder)] mt-0.5">
                      이전 달 기준 {formatAmount(fallback)}원
                    </div>
                  )}
                </div>
                {cat.budget_excluded ? (
                  <span className="shrink-0 rounded-lg bg-[var(--color-surface-sub)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-sub)]">
                    예산 비대상
                  </span>
                ) : (
                  <div className="w-36 shrink-0">
                    <AmountField
                      value={Number(inputVal) || 0}
                      onChange={n => setInputs(prev => ({ ...prev, [cat.id]: n > 0 ? String(n) : '' }))}
                      size="md"
                      title={`${cat.name} 예산`}
                      placeholder={fallback > 0 ? formatAmount(fallback) : '0'}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/settings/categories/expense"
            className="text-[13px] text-[var(--color-primary)]"
          >
            + 지출 카테고리 추가
          </Link>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="fixed left-0 right-0 px-4 pt-3 pb-4 bg-[var(--color-surface)] border-t border-[var(--color-border)]" style={{ bottom: 'var(--bottom-nav-total)' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full max-w-2xl mx-auto block py-4 rounded-2xl text-[16px] font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bg-[var(--color-text)] text-[var(--color-surface)] text-[14px] font-medium px-4 py-3 rounded-xl shadow-e3 z-50 whitespace-nowrap" style={{ bottom: 'calc(var(--bottom-nav-total) + 80px)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
