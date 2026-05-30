'use client'

import { useState, useEffect } from 'react'
import { Pin, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { generateId, todayStr } from '@/lib/utils'
import { MEMO_COLORS } from '@/lib/memoColors'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { Memo } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  editing?: Memo | null
  /** 새 메모의 기본 날짜 (현재 보고 있는 월의 오늘/1일 등). 미지정 시 오늘 */
  defaultDate?: string
}

export default function MemoForm({ open, onClose, editing, defaultDate }: Props) {
  const { addMemo, updateMemo, deleteMemo } = useStore()
  const [date, setDate] = useState('')
  const [hasDate, setHasDate] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [color, setColor] = useState('')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      const initDate = editing ? editing.date : (defaultDate ?? todayStr())
      setHasDate(editing ? !!editing.date : true)
      setDate(initDate || todayStr())
      setTitle(editing?.title ?? '')
      setContent(editing?.content ?? '')
      setColor(editing?.color ?? '')
      setPinned(editing?.pinned ?? false)
    }
  }, [open, editing, defaultDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() && !content.trim()) { onClose(); return }
    setSaving(true)
    const memo: Memo = {
      id: editing?.id ?? generateId('memo'),
      date: hasDate ? date : '',
      title: title.trim(),
      content: content.trim(),
      color,
      pinned,
      created_at: editing?.created_at ?? new Date().toISOString(),
    }
    const url = editing ? `/api/memos/${editing.id}` : '/api/memos'
    const method = editing ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memo) })
    const data = await res.json()
    if (editing) updateMemo(data)
    else addMemo(data)
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!editing) return
    setDeleting(true)
    await fetch(`/api/memos/${editing.id}`, { method: 'DELETE' })
    deleteMemo(editing.id)
    setDeleting(false)
    setConfirmDelete(false)
    onClose()
  }

  const inputCls = 'w-full border border-[var(--color-border)] rounded-xl px-4 py-3 text-[16px] text-[var(--color-text)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)]'
  const labelCls = 'block text-sm font-medium text-[var(--color-text-sub)] mb-1'

  return (
    <>
      <SlideUpSheet
        open={open}
        onClose={onClose}
        title={editing ? '메모 수정' : '새 메모'}
        rightAction={
          <button
            type="button"
            onClick={() => setPinned(v => !v)}
            className={pinned ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-sub)]'}
            aria-label="상단 고정"
            aria-pressed={pinned}
          >
            <Pin size={20} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 날짜 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls + ' mb-0'}>날짜</label>
              <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-sub)]">
                <input type="checkbox" checked={!hasDate} onChange={e => setHasDate(!e.target.checked)} />
                날짜 없음
              </label>
            </div>
            <input
              className={inputCls + (hasDate ? '' : ' opacity-40')}
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={!hasDate}
            />
          </div>

          {/* 제목 */}
          <div>
            <label className={labelCls}>제목</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="제목 (선택)" autoFocus />
          </div>

          {/* 내용 */}
          <div>
            <label className={labelCls}>내용</label>
            <textarea
              className={inputCls + ' resize-none'}
              rows={6}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="메모 내용 (선택)"
            />
          </div>

          {/* 색상 */}
          <div>
            <label className={labelCls}>색상</label>
            <div className="flex gap-2.5 flex-wrap">
              {MEMO_COLORS.map(c => {
                const selected = color === c
                return (
                  <button
                    key={c || 'none'}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-full flex-shrink-0 transition-transform active:scale-95"
                    style={{
                      background: c || 'var(--color-surface)',
                      border: selected ? '2.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                    }}
                    aria-label={c ? `색상 ${c}` : '색 없음'}
                    aria-pressed={selected}
                  />
                )
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || (!title.trim() && !content.trim())}
            className="w-full h-14 rounded-xl bg-[var(--color-primary)] text-white text-[16px] font-semibold disabled:opacity-50 mt-2"
          >
            {saving ? '저장 중…' : editing ? '수정 완료' : '저장'}
          </button>

          {editing && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full h-12 rounded-xl border border-[var(--color-border)] text-[15px] font-medium text-[var(--color-expense)] flex items-center justify-center gap-1.5"
            >
              <Trash2 size={16} />
              메모 삭제
            </button>
          )}
        </form>
      </SlideUpSheet>

      <ConfirmDialog
        open={confirmDelete}
        title="이 메모를 삭제할까요?"
        description="삭제한 메모는 복구할 수 없어요."
        confirmLabel="삭제"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}
