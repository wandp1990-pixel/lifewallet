'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { generateId } from '@/lib/utils'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import type { WishlistItem } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  editing?: WishlistItem | null
}

export default function WishlistForm({ open, onClose, editing }: Props) {
  const { addWishlistItem, updateWishlistItem } = useStore()
  const [name, setName] = useState('')
  const [type, setType] = useState<'wish' | 'event'>('wish')
  const [price, setPrice] = useState('')
  const [priority, setPriority] = useState<1 | 2 | 3>(2)
  const [targetDate, setTargetDate] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setType(editing?.type ?? 'wish')
      setPrice(editing?.price ? String(editing.price) : '')
      setPriority(editing?.priority ?? 2)
      setTargetDate(editing?.target_date ?? '')
      setMemo(editing?.memo ?? '')
    }
  }, [open, editing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const item: WishlistItem = {
      id: editing?.id ?? generateId('wsh'),
      type,
      name: name.trim(),
      price: Number(price) || 0,
      priority,
      target_date: targetDate,
      is_done: editing?.is_done ?? false,
      memo: memo.trim(),
      created_at: editing?.created_at ?? new Date().toISOString(),
    }
    const url = editing ? `/api/wishlist/${editing.id}` : '/api/wishlist'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
    const data = await res.json()
    if (editing) updateWishlistItem(data)
    else addWishlistItem(data)
    setSaving(false)
    onClose()
  }

  const inputCls = 'w-full border border-[var(--color-border)] rounded-xl px-4 py-3 text-[15px] text-[var(--color-text)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)]'
  const labelCls = 'block text-sm font-medium text-[var(--color-text-sub)] mb-1'

  return (
    <SlideUpSheet open={open} onClose={onClose} title={editing ? '항목 수정' : '항목 추가'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>이름 *</label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="예: 에어팟, 결혼 선물" required />
        </div>
        <div>
          <label className={labelCls}>타입</label>
          <div className="flex gap-2">
            {(['wish', 'event'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 h-10 rounded-xl text-sm font-medium border transition-colors ${type === t ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-[var(--color-surface)] text-[var(--color-text-body)] border-[var(--color-border)]'}`}
              >
                {t === 'wish' ? '위시' : '경조사'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>가격</label>
          <input className={inputCls} type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" min="0" />
        </div>
        <div>
          <label className={labelCls}>우선순위</label>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map(p => {
              const labels = { 1: '높음', 2: '보통', 3: '낮음' }
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 h-10 rounded-xl text-sm font-medium border transition-colors ${priority === p ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-[var(--color-surface)] text-[var(--color-text-body)] border-[var(--color-border)]'}`}
                >
                  {labels[p]}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className={labelCls}>목표일</label>
          <input className={inputCls} type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
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
