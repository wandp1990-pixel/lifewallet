'use client'

import { useState, useMemo } from 'react'
import { Plus, Star } from 'lucide-react'
import { useStore } from '@/lib/store'
import WishlistItemRow from '@/components/wishlist/WishlistItemRow'
import WishlistForm from '@/components/wishlist/WishlistForm'
import type { WishlistItem } from '@/lib/types'

type StatusTab = 'all' | 'pending' | 'done'
type TypeTab = 'all' | 'wish' | 'event'
type SortKey = 'priority' | 'date' | 'added'

export default function WishlistPage() {
  const { wishlist, ready } = useStore()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WishlistItem | null>(null)
  const [statusTab, setStatusTab] = useState<StatusTab>('pending')
  const [typeTab, setTypeTab] = useState<TypeTab>('all')
  const [sort, setSort] = useState<SortKey>('priority')

  const filtered = useMemo(() => {
    let items = [...wishlist]
    if (statusTab === 'pending') items = items.filter(i => !i.is_done)
    if (statusTab === 'done') items = items.filter(i => i.is_done)
    if (typeTab === 'wish') items = items.filter(i => i.type === 'wish')
    if (typeTab === 'event') items = items.filter(i => i.type === 'event')
    if (sort === 'priority') items.sort((a, b) => a.priority - b.priority)
    else if (sort === 'date') items.sort((a, b) => {
      if (!a.target_date && !b.target_date) return 0
      if (!a.target_date) return 1
      if (!b.target_date) return -1
      return a.target_date.localeCompare(b.target_date)
    })
    else items.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return items
  }, [wishlist, statusTab, typeTab, sort])

  function openEdit(item: WishlistItem) {
    setEditing(item)
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

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-sub)] hover:bg-[var(--color-surface-sub)]'}`

  const pendingCount = wishlist.filter(i => !i.is_done).length

  return (
    <>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--color-text)]">위시리스트</h1>
          <button
            onClick={() => { setEditing(null); setFormOpen(true) }}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold"
          >
            <Plus size={16} />
            항목 추가
          </button>
        </div>

        {/* 필터 탭 */}
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 bg-[var(--color-surface-sub)] p-1 rounded-xl">
            {(['all', 'pending', 'done'] as const).map(s => (
              <button key={s} className={tabCls(statusTab === s)} onClick={() => setStatusTab(s)}>
                {s === 'all' ? '전체' : s === 'pending' ? `미완료 ${pendingCount > 0 ? `(${pendingCount})` : ''}` : '완료'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-[var(--color-surface-sub)] p-1 rounded-xl">
            {(['all', 'wish', 'event'] as const).map(t => (
              <button key={t} className={tabCls(typeTab === t)} onClick={() => setTypeTab(t)}>
                {t === 'all' ? '전체' : t === 'wish' ? '위시' : '경조사'}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="px-3 py-1.5 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-body)] bg-[var(--color-surface)] focus:outline-none"
          >
            <option value="priority">우선순위순</option>
            <option value="date">날짜순</option>
            <option value="added">추가순</option>
          </select>
        </div>

        {/* 목록 */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-[var(--color-surface-sub)] flex items-center justify-center">
              <Star size={28} className="text-[var(--color-text-placeholder)]" />
            </div>
            {statusTab === 'done' ? (
              <p className="text-sm text-[var(--color-text-sub)]">완료한 항목이 없습니다</p>
            ) : wishlist.length === 0 ? (
              <>
                <p className="text-sm text-[var(--color-text-body)]">위시리스트가 비어 있습니다</p>
                <button
                  onClick={() => { setEditing(null); setFormOpen(true) }}
                  className="h-10 px-5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold"
                >
                  항목 추가
                </button>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-sub)]">해당하는 항목이 없습니다</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <WishlistItemRow key={item.id} item={item} onEdit={openEdit} />
            ))}
          </div>
        )}
      </div>

      <WishlistForm open={formOpen} onClose={handleClose} editing={editing} />
    </>
  )
}
