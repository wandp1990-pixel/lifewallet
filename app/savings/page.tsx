'use client'

import { useState, useMemo } from 'react'
import { Plus, PiggyBank } from 'lucide-react'
import { useStore } from '@/lib/store'
import { formatAmount } from '@/lib/utils'
import SavingsGoalCard from '@/components/savings/SavingsGoalCard'
import SavingsGoalForm from '@/components/savings/SavingsGoalForm'
import type { SavingsGoal } from '@/lib/types'

export default function SavingsPage() {
  const { savingsGoals, ready } = useStore()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SavingsGoal | null>(null)

  const sorted = useMemo(() => {
    return [...savingsGoals].sort((a, b) => {
      if (!a.target_date && !b.target_date) return 0
      if (!a.target_date) return 1
      if (!b.target_date) return -1
      return a.target_date.localeCompare(b.target_date)
    })
  }, [savingsGoals])

  const totalCurrent = savingsGoals.reduce((s, g) => s + g.current_amount, 0)
  const totalTarget = savingsGoals.reduce((s, g) => s + g.target_amount, 0)
  const totalPct = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0

  function openEdit(goal: SavingsGoal) {
    setEditing(goal)
    setFormOpen(true)
  }

  function handleClose() {
    setFormOpen(false)
    setEditing(null)
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-sm">불러오는 중…</p>
      </div>
    )
  }

  return (
    <>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--color-text)]">저축 목표</h1>
          <button
            onClick={() => { setEditing(null); setFormOpen(true) }}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
          >
            <Plus size={16} />
            목표 추가
          </button>
        </div>

        {/* 요약 카드 */}
        {savingsGoals.length > 0 && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-baseline">
              <div>
                <p className="text-xs text-[var(--color-text-sub)] mb-0.5">목표별 저축 합계</p>
                <p className="text-2xl font-bold text-[var(--color-text)] tabular-nums">{formatAmount(totalCurrent)}원</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--color-text-sub)] mb-0.5">목표액</p>
                <p className="text-lg font-semibold text-[var(--color-text-body)] tabular-nums">{formatAmount(totalTarget)}원</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-[var(--color-text-sub)] mb-1">
                <span>전체 달성률</span>
                <span>{totalPct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-[var(--color-surface-sub)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                  style={{ width: `${totalPct}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--color-text-placeholder)] mt-2">
                같은 자산을 여러 목표에 연결하면 실제 보유 현금보다 크게 보일 수 있어요.
              </p>
            </div>
          </div>
        )}

        {/* 목표 목록 */}
        {savingsGoals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-[var(--color-surface-sub)] flex items-center justify-center">
              <PiggyBank size={28} className="text-[var(--color-text-placeholder)]" />
            </div>
            <p className="text-sm text-[var(--color-text-body)]">저축 목표를 추가해서 달성률을 추적해 보세요</p>
            <button
              onClick={() => { setEditing(null); setFormOpen(true) }}
              className="h-11 px-5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold"
            >
              목표 추가
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map(goal => (
              <SavingsGoalCard key={goal.id} goal={goal} onEdit={openEdit} />
            ))}
          </div>
        )}
      </div>

      <SavingsGoalForm open={formOpen} onClose={handleClose} editing={editing} />
    </>
  )
}
