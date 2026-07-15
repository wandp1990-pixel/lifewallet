'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { groupAssets } from '@/lib/assetGroups'
import { isLoanPaidOff } from '@/lib/finance'
import PaidOffBadge from '@/components/ui/PaidOffBadge'
import type { Asset } from '@/lib/types'

// 그룹별 자산 선택 UI. 내역 추가 시트·카테고리 폼(기본 자산) 등이 공유한다.
// pool 구성(숨김·대출 포함 여부)은 호출부 책임. 숨김 자산은 선택 목록에 유지한다(DESIGN.md LF8).
// noneOption을 주면 목록 맨 위에 "없음"(선택 해제, id='') 버튼을 노출한다.
export default function AssetGroupPicker({
  pool,
  selectedId,
  onSelect,
  noneOption,
}: {
  pool: Asset[]
  selectedId: string
  onSelect: (id: string) => void
  noneOption?: { label: string }
}) {
  const groups = useMemo(() => groupAssets(pool), [pool])
  // 선택된 자산이 속한 그룹만 펼친 상태로 시작
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const sel = pool.find(a => a.id === selectedId)
    return new Set(sel ? [sel.group_type] : groups[0] ? [groups[0].type] : [])
  })

  function toggle(g: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  if (groups.length === 0 && !noneOption) {
    return <p className="py-6 text-center text-[13px] text-[var(--color-text-sub)]">선택 가능한 자산이 없습니다.</p>
  }

  return (
    <div className="space-y-1.5">
      {noneOption && (
        <button
          type="button"
          onClick={() => onSelect('')}
          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            selectedId === ''
              ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
          }`}
        >
          {noneOption.label}
        </button>
      )}
      {groups.map(({ type, label, items }) => {
        const isOpen = expanded.has(type)
        const hasSelected = items.some(a => a.id === selectedId)
        return (
          <div key={type} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(type)}
              className="flex w-full items-center justify-between px-3 py-2.5"
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]">
                {label}
                <span className="text-[11px] font-normal text-[var(--color-text-sub)]">{items.length}</span>
                {hasSelected && !isOpen && (() => {
                  const sel = items.find(a => a.id === selectedId)
                  return (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-primary)]">
                      · {sel?.name}
                      {sel && isLoanPaidOff(sel) && <PaidOffBadge />}
                    </span>
                  )
                })()}
              </span>
              <ChevronDown size={16} className={`text-[var(--color-text-sub)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="flex flex-wrap gap-2 px-3 pb-3 pt-0.5">
                {items.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect(a.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
                      selectedId === a.id
                        ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'bg-[var(--color-surface-sub)] text-[var(--color-text-body)] border-transparent'
                    }`}
                  >
                    {a.name}{!a.visible ? ' (숨김)' : ''}
                    {isLoanPaidOff(a) && <PaidOffBadge />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
