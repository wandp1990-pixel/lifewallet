'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { generateId } from '@/lib/utils'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import AmountField from '@/components/ui/AmountField'
import type { SavingsGoal } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  editing?: SavingsGoal | null
  defaultAssetId?: string
}

export default function SavingsGoalForm({ open, onClose, editing, defaultAssetId }: Props) {
  const { assets, addSavingsGoal, updateSavingsGoal } = useStore()
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [assetId, setAssetId] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setTargetAmount(editing ? String(editing.target_amount) : '')
      setCurrentAmount(editing ? String(editing.current_amount) : '0')
      setTargetDate(editing?.target_date ?? '')
      setAssetId(editing?.asset_id ?? defaultAssetId ?? '')
      setMemo(editing?.memo ?? '')
    }
  }, [open, editing, defaultAssetId])

  const savingsAssets = assets.filter(a => a.group_type === 'savings')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const goal: SavingsGoal = {
      id: editing?.id ?? generateId('sav'),
      name: name.trim(),
      target_amount: Number(targetAmount) || 0,
      current_amount: Number(currentAmount) || 0,
      target_date: targetDate,
      asset_id: assetId,
      memo: memo.trim(),
      created_at: editing?.created_at ?? new Date().toISOString(),
    }
    const url = editing ? `/api/savings/${editing.id}` : '/api/savings'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(goal) })
    const data = await res.json()
    if (editing) updateSavingsGoal(data)
    else addSavingsGoal(data)
    setSaving(false)
    onClose()
  }

  const inputCls = 'w-full border border-[var(--color-border)] rounded-xl px-4 py-3 text-[16px] text-[var(--color-text)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)]'
  const labelCls = 'block text-sm font-medium text-[var(--color-text-sub)] mb-1'

  return (
    <SlideUpSheet open={open} onClose={onClose} title={editing ? '목표 수정' : '목표 추가'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>목표 이름 *</label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="예: 비상금, 제주도 여행" required />
        </div>
        <div>
          <label className={labelCls}>목표 금액 *</label>
          <AmountField
            value={Number(targetAmount) || 0}
            onChange={n => setTargetAmount(n > 0 ? String(n) : '')}
            size="md"
            title="목표 금액"
          />
        </div>
        <div>
          <label className={labelCls}>현재 금액</label>
          <AmountField
            value={Number(currentAmount) || 0}
            onChange={n => setCurrentAmount(String(n))}
            size="md"
            title="현재 금액"
          />
        </div>
        <div>
          <label className={labelCls}>목표 날짜</label>
          <input className={inputCls} type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>연결 자산 (선택)</label>
          <select className={inputCls} value={assetId} onChange={e => setAssetId(e.target.value)}>
            <option value="">연결 안 함</option>
            {savingsAssets.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>메모</label>
          <input className={inputCls} value={memo} onChange={e => setMemo(e.target.value)} placeholder="선택 입력" />
        </div>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full h-14 rounded-xl bg-[var(--color-primary)] text-white text-[16px] font-semibold disabled:opacity-50 mt-2"
        >
          {saving ? '저장 중…' : editing ? '수정 완료' : '추가하기'}
        </button>
      </form>
    </SlideUpSheet>
  )
}
