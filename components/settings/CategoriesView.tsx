'use client'

import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, Plus } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Category } from '@/lib/types'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import CatIcon from '@/components/ui/CatIcon'
import CategoryForm from './CategoryForm'

type CategoryType = 'income' | 'expense'

interface CategoriesViewProps {
  type: CategoryType
}

export default function CategoriesView({ type }: CategoriesViewProps) {
  const { categories, ready, addCategory, updateCategory, deleteCategory, reorderCategories } = useStore()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const items = useMemo(
    () => categories.filter(c => c.type === type).sort((a, b) => a.order - b.order),
    [categories, type]
  )

  function openAdd() {
    setEditing(null)
    setSheetOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setSheetOpen(true)
  }

  async function handleSubmit(values: { name: string; icon: string }) {
    if (editing) {
      const res = await fetch(`/api/categories/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '저장에 실패했습니다' }))
        throw new Error(err.error ?? '저장에 실패했습니다')
      }
      const updated: Category = await res.json()
      updateCategory(updated)
    } else {
      const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) + 1 : 0
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, type, order: nextOrder }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '저장에 실패했습니다' }))
        throw new Error(err.error ?? '저장에 실패했습니다')
      }
      const created: Category = await res.json()
      addCategory(created)
    }
    setSheetOpen(false)
  }

  async function handleDelete(cat: Category) {
    const ok = confirm(`"${cat.name}" 카테고리를 삭제할까요?\n\n이 카테고리를 사용 중인 거래가 있으면 해당 거래의 분류가 '미분류'로 변경됩니다.`)
    if (!ok) return
    const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '삭제에 실패했습니다' }))
      alert(err.error ?? '삭제에 실패했습니다')
      return
    }
    deleteCategory(cat.id)
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const a = items[index]
    const b = items[target]
    const newAOrder = b.order
    const newBOrder = a.order

    const [resA, resB] = await Promise.all([
      fetch(`/api/categories/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newAOrder }),
      }),
      fetch(`/api/categories/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newBOrder }),
      }),
    ])
    if (!resA.ok || !resB.ok) {
      alert('순서 변경에 실패했습니다')
      return
    }
    const updatedA: Category = await resA.json()
    const updatedB: Category = await resB.json()
    reorderCategories(
      categories.map(c => c.id === updatedA.id ? updatedA : c.id === updatedB.id ? updatedB : c)
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          {type === 'income' ? '수입 카테고리' : '지출 카테고리'}
        </h1>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-1 h-10 px-4 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} />
          카테고리 추가
        </button>
      </div>

      {!ready && (
        <p className="text-sm text-[var(--color-text-sub)]">불러오는 중…</p>
      )}

      {ready && items.length === 0 && (
        <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-body)] mb-3">
            {type === 'income' ? '수입' : '지출'} 카테고리를 추가하면 거래에서 분류할 수 있어요
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="h-10 px-4 rounded-xl border border-[var(--color-primary)] text-[var(--color-primary)] text-sm font-semibold hover:bg-[var(--color-primary-subtle)] transition-colors"
          >
            카테고리 추가
          </button>
        </div>
      )}

      {ready && items.length > 0 && (
        <ul className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
          {items.map((cat, index) => (
            <li
              key={cat.id}
              className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="w-7 h-6 flex items-center justify-center text-[var(--color-text-sub)] disabled:opacity-30 hover:text-[var(--color-text)]"
                  aria-label="위로"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  className="w-7 h-6 flex items-center justify-center text-[var(--color-text-sub)] disabled:opacity-30 hover:text-[var(--color-text)]"
                  aria-label="아래로"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => openEdit(cat)}
                className="flex-1 flex items-center gap-2 py-2 text-left"
              >
                <CatIcon icon={cat.icon || '📦'} id={cat.id} size={36} />
                <span className="text-[15px] text-[var(--color-text)]">{cat.name}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(cat)}
                className="text-sm text-[var(--color-expense)] px-2 py-1 hover:opacity-80"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <SlideUpSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? '카테고리 수정' : '카테고리 추가'}
      >
        <CategoryForm
          initial={editing ? { name: editing.name, icon: editing.icon } : undefined}
          onSubmit={handleSubmit}
          submitLabel={editing ? '수정' : '추가'}
        />
      </SlideUpSheet>
    </div>
  )
}
