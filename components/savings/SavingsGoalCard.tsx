'use client'

import { useState } from 'react'
import { MoreHorizontal, Trash2, Pencil } from 'lucide-react'
import { useStore } from '@/lib/store'
import { formatAmount } from '@/lib/utils'
import type { SavingsGoal } from '@/lib/types'

function dDay(dateStr: string): string {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return 'D-Day'
  return `${Math.abs(diff)}일 지남`
}

interface Props {
  goal: SavingsGoal
  onEdit: (goal: SavingsGoal) => void
}

export default function SavingsGoalCard({ goal, onEdit }: Props) {
  const { assets, deleteSavingsGoal } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0
  const linkedAsset = assets.find(a => a.id === goal.asset_id)

  async function handleDelete() {
    await fetch(`/api/savings/${goal.id}`, { method: 'DELETE' })
    deleteSavingsGoal(goal.id)
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[var(--color-text)] truncate">{goal.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {goal.target_date && (
              <span className="text-xs text-[var(--color-text-sub)]">{dDay(goal.target_date)}</span>
            )}
            {linkedAsset && (
              <span className="text-xs text-[var(--color-primary)] bg-[var(--color-primary-subtle)] px-1.5 py-0.5 rounded-full">{linkedAsset.name}</span>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sub)]"
            aria-label="목표 메뉴"
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0px_4px_12px_rgba(0,0,0,0.12)] overflow-hidden min-w-[120px]">
                <button
                  className="flex items-center gap-2 w-full px-4 py-3 text-[14px] text-[var(--color-text)] hover:bg-[var(--color-surface-sub)]"
                  onClick={() => { setMenuOpen(false); onEdit(goal) }}
                >
                  <Pencil size={14} /> 수정
                </button>
                <button
                  className="flex items-center gap-2 w-full px-4 py-3 text-[14px] text-[var(--color-expense)] hover:bg-[var(--color-surface-sub)]"
                  onClick={() => { setMenuOpen(false); setConfirming(true) }}
                >
                  <Trash2 size={14} /> 삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="font-semibold text-[var(--color-text)]">{formatAmount(goal.current_amount)}원</span>
          <span className="text-[var(--color-text-sub)]">{pct}% / {formatAmount(goal.target_amount)}원</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--color-surface-sub)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--color-surface)] rounded-2xl p-6 mx-4 max-w-sm w-full shadow-[0px_8px_24px_rgba(0,0,0,0.16)]">
            <p className="text-[16px] font-semibold text-[var(--color-text)] mb-2">목표를 삭제할까요?</p>
            <p className="text-sm text-[var(--color-text-sub)] mb-6">"{goal.name}" 목표가 삭제됩니다.</p>
            <div className="flex gap-3">
              <button
                className="flex-1 h-12 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] text-[15px] font-medium"
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
              <button
                className="flex-1 h-12 rounded-xl bg-[var(--color-expense)] text-white text-[15px] font-semibold"
                onClick={handleDelete}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
