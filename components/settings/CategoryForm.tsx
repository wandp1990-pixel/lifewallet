'use client'

import { useState, type FormEvent } from 'react'
import type { Category } from '@/lib/types'
import CatIcon, { ICON_KEYS, ICON_LABELS } from '@/components/ui/CatIcon'

interface CategoryFormProps {
  initial?: Pick<Category, 'name' | 'icon'>
  onSubmit: (values: { name: string; icon: string }) => Promise<void> | void
  submitLabel?: string
}

export default function CategoryForm({ initial, onSubmit, submitLabel = '저장' }: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? 'box')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('카테고리 이름을 입력해주세요')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ name: name.trim(), icon })
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* 이름 */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--color-text-body)]">이름</span>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          placeholder="예: 식비"
          className="rounded-xl bg-[rgba(0,23,51,0.02)] border border-[rgba(2,32,71,0.05)] px-4 py-3.5 text-[17px] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
        />
      </label>

      {/* 아이콘 선택 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--color-text-body)]">아이콘</span>
        <div className="grid grid-cols-6 gap-2">
          {ICON_KEYS.map(key => {
            const selected = icon === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                title={ICON_LABELS[key]}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl border transition-colors ${
                  selected
                    ? 'bg-[var(--color-primary-subtle)] border-[var(--color-primary)]'
                    : 'bg-[var(--color-surface-sub)] border-transparent hover:border-[var(--color-border-strong)]'
                }`}
              >
                <CatIcon
                  icon={key}
                  id={selected ? 'selected' : ''}
                  size={32}
                  color={selected ? 'var(--color-primary)' : 'var(--color-text-sub)'}
                />
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-[var(--color-text-sub)]">
          선택됨: {ICON_LABELS[icon as keyof typeof ICON_LABELS] ?? icon}
        </p>
      </div>

      {error && (
        <p className="text-[13px] text-[var(--color-expense)]" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-12 rounded-xl bg-[var(--color-primary)] text-white text-base font-semibold disabled:opacity-50 hover:bg-[var(--color-primary-hover)] transition-colors"
      >
        {submitting ? '저장 중…' : submitLabel}
      </button>
    </form>
  )
}
