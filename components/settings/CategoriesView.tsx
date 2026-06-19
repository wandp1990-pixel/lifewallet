'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, Plus } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Category, Essentiality } from '@/lib/types'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import CatIcon from '@/components/ui/CatIcon'
import CategoryForm from './CategoryForm'

type CategoryType = 'income' | 'expense' | 'asset'
type LocalCategory = Category & { _isNew?: boolean }

interface CategoriesViewProps {
  type: CategoryType
}

export default function CategoriesView({ type }: CategoriesViewProps) {
  const { categories, ready, reorderCategories } = useStore()
  const [localItems, setLocalItems] = useState<LocalCategory[]>([])
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<LocalCategory | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (!ready || initialized.current) return
    initialized.current = true
    setLocalItems(
      categories
        .filter(c => c.type === type)
        .sort((a, b) => a.order - b.order)
    )
  }, [ready, categories, type])

  function openAdd() {
    setEditing(null)
    setSheetOpen(true)
  }

  function openEdit(cat: LocalCategory) {
    setEditing(cat)
    setSheetOpen(true)
  }

  function handleSubmit(values: { name: string; icon: string; essentiality: Essentiality; budget_excluded: boolean; default_asset_id: string }) {
    if (editing) {
      setLocalItems(prev => prev.map(item =>
        item.id === editing.id ? { ...item, ...values } : item
      ))
    } else {
      const nextOrder = localItems.length > 0
        ? Math.max(...localItems.map(i => i.order)) + 1
        : 0
      setLocalItems(prev => [...prev, {
        id: `_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type,
        name: values.name,
        icon: values.icon,
        order: nextOrder,
        visible: true,
        is_system: false,
        essentiality: values.essentiality,
        budget_excluded: values.budget_excluded,
        default_asset_id: values.default_asset_id,
        _isNew: true,
      }])
    }
    setDirty(true)
    setSheetOpen(false)
  }

  function handleDelete(cat: LocalCategory) {
    setLocalItems(prev => prev.filter(i => i.id !== cat.id))
    if (!cat._isNew) setDeletedIds(prev => new Set([...prev, cat.id]))
    setDirty(true)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= localItems.length) return
    setLocalItems(prev => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((item, i) => ({ ...item, order: i }))
    })
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      // 1. 삭제
      await Promise.all([...deletedIds].map(id =>
        fetch(`/api/categories/${id}`, { method: 'DELETE' })
      ))

      // 2. 위치 기반 order 재부여
      const itemsWithOrder = localItems.map((item, i) => ({ ...item, order: i }))

      // 3. 새 카테고리 생성 (순서대로, tempId → realId 매핑)
      const newItems = itemsWithOrder.filter(i => i._isNew)
      const tempToReal = new Map<string, Category>()
      for (const item of newItems) {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: item.name, icon: item.icon, type, order: item.order, essentiality: item.essentiality, budget_excluded: item.budget_excluded, default_asset_id: item.default_asset_id }),
        })
        if (!res.ok) throw new Error('카테고리 추가에 실패했습니다')
        tempToReal.set(item.id, await res.json())
      }

      // 4. 기존 카테고리 변경사항 업데이트
      const origMap = new Map(categories.filter(c => c.type === type).map(c => [c.id, c]))
      await Promise.all(
        itemsWithOrder
          .filter(item => {
            if (item._isNew) return false
            const orig = origMap.get(item.id)
            return orig && (orig.name !== item.name || orig.icon !== item.icon || orig.order !== item.order || orig.essentiality !== item.essentiality || orig.budget_excluded !== item.budget_excluded || orig.default_asset_id !== item.default_asset_id)
          })
          .map(item =>
            fetch(`/api/categories/${item.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: item.name, icon: item.icon, order: item.order, essentiality: item.essentiality, budget_excluded: item.budget_excluded, default_asset_id: item.default_asset_id }),
            })
          )
      )

      // 5. tempId를 실제 ID로 교체한 최종 목록 생성
      const savedItems: Category[] = itemsWithOrder.map(item => {
        if (item._isNew) {
          const real = tempToReal.get(item.id)
          return real ?? ({ ...item, _isNew: undefined } as Category)
        }
        const { _isNew: _, ...rest } = item
        return rest as Category
      })

      // 6. store 전체 categories 교체 (다른 타입 보존)
      const otherTypeCategories = categories.filter(c => c.type !== type)
      reorderCategories([...otherTypeCategories, ...savedItems])

      setLocalItems(savedItems)
      setDeletedIds(new Set())
      setDirty(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const title =
    type === 'income' ? '수입 카테고리' :
    type === 'expense' ? '지출 카테고리' : '자산 카테고리'

  const emptyMsg =
    type === 'asset'
      ? '자산 그룹 이름을 추가하면 자산 등록 시 선택할 수 있어요'
      : `${type === 'income' ? '수입' : '지출'} 카테고리를 추가하면 거래에서 분류할 수 있어요`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{title}</h1>
        <button
          type="button"
          onClick={openAdd}
          className="flex h-11 items-center gap-1 rounded-xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} />
          카테고리 추가
        </button>
      </div>

      {!ready && (
        <p className="text-sm text-[var(--color-text-sub)]">불러오는 중…</p>
      )}

      {ready && localItems.length === 0 && (
        <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-body)] mb-3">{emptyMsg}</p>
          <button
            type="button"
            onClick={openAdd}
            className="h-11 px-4 rounded-xl border border-[var(--color-primary)] text-[var(--color-primary)] text-sm font-semibold hover:bg-[var(--color-primary-subtle)] transition-colors"
          >
            카테고리 추가
          </button>
        </div>
      )}

      {ready && localItems.length > 0 && (
        <ul className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
          {localItems.map((cat, index) => (
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
                  disabled={index === localItems.length - 1}
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
                <CatIcon icon={cat.icon || 'box'} id={cat.id} size={36} />
                <span className="text-[15px] text-[var(--color-text)] truncate">{cat.name}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(cat)}
                className="text-sm px-2 py-1 text-[var(--color-expense)] hover:opacity-80"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {dirty && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 rounded-xl bg-[var(--color-primary)] text-white text-base font-semibold disabled:opacity-50 hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          {saving ? '저장 중…' : '저장하기'}
        </button>
      )}

      <SlideUpSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? '카테고리 수정' : '카테고리 추가'}
      >
        <CategoryForm
          initial={editing ? { name: editing.name, icon: editing.icon, essentiality: editing.essentiality, budget_excluded: editing.budget_excluded, default_asset_id: editing.default_asset_id } : undefined}
          onSubmit={handleSubmit}
          submitLabel={editing ? '수정' : '추가'}
          showEssentiality={type === 'expense'}
          showDefaultAsset={type !== 'asset'}
        />
      </SlideUpSheet>
    </div>
  )
}
