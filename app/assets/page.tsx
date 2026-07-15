'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react'
import { useStore } from '@/lib/store'
import { getDebtBalance, isDebtAssetType, isLoanPaidOff } from '@/lib/finance'
import { formatAmount } from '@/lib/utils'
import AssetForm from '@/components/assets/AssetForm'
import PaidOffBadge from '@/components/ui/PaidOffBadge'
import { ASSET_GROUP_ORDER as GROUP_ORDER, ASSET_GROUP_LABELS as GROUP_LABELS } from '@/lib/assetGroups'
import type { Asset, AssetGroupType } from '@/lib/types'

type MenuAction = 'edit' | 'toggle-included' | 'delete'

export default function AssetsPage() {
  const router = useRouter()
  const { assets, ready, updateAsset } = useStore()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)

  const groups = useMemo(() => {
    const map = new Map<AssetGroupType, Asset[]>()
    for (const a of assets) {
      if (!map.has(a.group_type)) map.set(a.group_type, [])
      map.get(a.group_type)!.push(a)
    }
    return GROUP_ORDER
      .filter(g => map.has(g))
      .map(g => ({ type: g, items: map.get(g)!.sort((a, b) => a.order - b.order) }))
  }, [assets])

  const totalAssets = useMemo(
    () => assets.filter(a => a.visible && !isDebtAssetType(a.group_type)).reduce((s, a) => s + a.balance, 0),
    [assets]
  )
  const totalDebt = useMemo(
    () => assets.filter(a => a.visible && isDebtAssetType(a.group_type)).reduce((s, a) => s + getDebtBalance(a.balance), 0),
    [assets]
  )
  const managedBalance = totalAssets - totalDebt

  const trackDetailAssets = useMemo(
    () => assets.filter(a => a.visible && a.track_detail),
    [assets]
  )
  const trackDetailRegularAssets = useMemo(
    () => trackDetailAssets.filter(a => !isDebtAssetType(a.group_type)),
    [trackDetailAssets]
  )
  const trackDetailDebtAssets = useMemo(
    () => trackDetailAssets.filter(a => isDebtAssetType(a.group_type)),
    [trackDetailAssets]
  )
  const selectedMenuAsset = assets.find(a => a.id === menuOpen) ?? null

  function toggleCollapse(groupType: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(groupType)) next.delete(groupType)
      else next.add(groupType)
      return next
    })
  }

  function openAdd() {
    setEditing(null)
    setSheetOpen(true)
  }

  function openEdit(asset: Asset) {
    setEditing(asset)
    setSheetOpen(true)
    setMenuOpen(null)
  }

  function handleAssetClick(asset: Asset) {
    if (asset.track_detail) {
      router.push(`/assets/${asset.id}`)
    } else {
      openEdit(asset)
    }
  }

  async function handleMenuAction(asset: Asset, action: MenuAction) {
    setMenuOpen(null)
    if (action === 'edit') {
      openEdit(asset)
    } else if (action === 'toggle-included') {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: !asset.visible }),
      })
      if (res.ok) {
        const updated = await res.json()
        updateAsset(updated)
      }
    } else if (action === 'delete') {
      setDeleteTarget(asset)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const res = await fetch(`/api/assets/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) {
      const updated = await res.json()
      updateAsset(updated)
    }
    setDeleteTarget(null)
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
      <div className="flex flex-col">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <h1 className="text-[17px] font-bold text-[var(--color-text)]">자산</h1>
          <button
            onClick={openAdd}
            className="flex h-11 items-center gap-1 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
          >
            <Plus size={16} />
            자산 추가
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 관리 잔액 카드 */}
          <div className="bg-[var(--color-surface-sub)] rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-xs text-[var(--color-text-sub)] mb-0.5">관리 잔액</p>
              <p className={`text-3xl font-bold ${managedBalance >= 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-expense)]'}`}>
                {managedBalance < 0 ? '-' : ''}{formatAmount(managedBalance)}원
              </p>
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-xs text-[var(--color-text-sub)]">관리 자산</p>
                <p className="font-semibold text-[var(--color-text)]">{formatAmount(totalAssets)}원</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-sub)]">관리 부채</p>
                <p className="font-semibold text-[var(--color-expense)]">{formatAmount(totalDebt)}원</p>
              </div>
            </div>

            {/* 자산/부채 구성 (track_detail ON만) */}
            {trackDetailAssets.length > 0 && (
              <div className="border-t border-[var(--color-border)] pt-3 space-y-3">
                {trackDetailRegularAssets.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[11px] font-semibold text-[var(--color-text-sub)]">자산 구성</span>
                      <span className="text-[11px] text-[var(--color-text-placeholder)]">
                        관리 자산 {formatAmount(totalAssets)}원 기준
                      </span>
                    </div>
                    {trackDetailRegularAssets.map(a => {
                      const pct = totalAssets > 0 ? Math.round((a.balance / totalAssets) * 100) : 0
                      return (
                        <button
                          key={a.id}
                          onClick={() => router.push(`/assets/${a.id}`)}
                          className="w-full flex items-center justify-between gap-3 text-sm hover:bg-[var(--color-surface)] rounded-lg px-2 py-1 transition-colors"
                        >
                          <span className="min-w-0 truncate text-[var(--color-text-body)]">{a.name}</span>
                          <span className="shrink-0 flex items-baseline gap-2 tabular-nums">
                            <span className="text-xs text-[var(--color-text-sub)]">{formatAmount(a.balance)}원</span>
                            <span className="w-9 text-right text-xs text-[var(--color-text-sub)]">{pct}%</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {trackDetailDebtAssets.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[11px] font-semibold text-[var(--color-text-sub)]">부채 구성</span>
                      <span className="text-[11px] text-[var(--color-text-placeholder)]">
                        관리 부채 {formatAmount(totalDebt)}원 기준
                      </span>
                    </div>
                    {trackDetailDebtAssets.map(a => {
                      const debtBalance = getDebtBalance(a.balance)
                      const pct = totalDebt > 0 ? Math.round((debtBalance / totalDebt) * 100) : 0
                      return (
                        <button
                          key={a.id}
                          onClick={() => router.push(`/assets/${a.id}`)}
                          className="w-full flex items-center justify-between gap-3 text-sm hover:bg-[var(--color-surface)] rounded-lg px-2 py-1 transition-colors"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate text-[var(--color-text-body)]">{a.name}</span>
                            {isLoanPaidOff(a) && <PaidOffBadge />}
                          </span>
                          <span className="shrink-0 flex items-baseline gap-2 tabular-nums">
                            <span className="text-xs text-[var(--color-expense)]">{formatAmount(debtBalance)}원</span>
                            <span className="w-9 text-right text-xs text-[var(--color-text-sub)]">{pct}%</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 그룹별 자산 목록 */}
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-sub)]">
              <p className="text-sm mb-3">자산이 없습니다</p>
              <button
                onClick={openAdd}
                className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold"
              >
                자산 추가
              </button>
            </div>
          ) : (
            groups.map(({ type, items }) => {
              const isCollapsed = collapsed.has(type)
              const isDebt = isDebtAssetType(type)
              const groupTotal = items
                .filter(a => a.visible)
                .reduce((s, a) => s + (isDebt ? getDebtBalance(a.balance) : a.balance), 0)
              return (
                <div key={type} className="bg-[var(--color-surface-sub)] rounded-2xl overflow-hidden">
                  {/* 섹션 헤더 */}
                  <button
                    onClick={() => toggleCollapse(type)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface)] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronDown size={16} className="text-[var(--color-text-sub)]" /> : <ChevronUp size={16} className="text-[var(--color-text-sub)]" />}
                      <span className="text-sm font-semibold text-[var(--color-text)]">{GROUP_LABELS[type]}</span>
                    </div>
                    <span className={`text-sm font-medium ${isDebt ? 'text-[var(--color-expense)]' : 'text-[var(--color-text)]'}`}>
                      {formatAmount(groupTotal)}원
                    </span>
                  </button>

                  {/* 아이템 목록 */}
                  {!isCollapsed && (
                    <div className="border-t border-[var(--color-border)]">
                      {items.map(asset => (
                        <div
                          key={asset.id}
                          className="relative flex items-center px-4 py-3 hover:bg-[var(--color-surface)] transition-colors border-b border-[var(--color-border)] last:border-b-0"
                        >
                          <button
                            className="flex-1 flex items-center justify-between text-left"
                            onClick={() => handleAssetClick(asset)}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={`truncate text-sm text-[var(--color-text-body)] ${!asset.visible ? 'opacity-55' : ''}`}>
                                {asset.name}
                              </span>
                              {!asset.visible && (
                                <span className="shrink-0 rounded bg-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-sub)]">
                                  집계 제외
                                </span>
                              )}
                              {isLoanPaidOff(asset) && <PaidOffBadge />}
                              {asset.target_balance_enabled && !isDebt && asset.balance < asset.target_balance && (
                                <span className="shrink-0 rounded-full bg-[var(--color-expense)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-expense)]">
                                  {formatAmount(asset.target_balance - asset.balance)}원 부족
                                </span>
                              )}
                            </span>
                            <span className={`shrink-0 text-sm font-semibold ${!asset.visible ? 'text-[var(--color-text-placeholder)]' : isDebt ? 'text-[var(--color-expense)]' : 'text-[var(--color-text)]'}`}>
                              {!asset.visible ? '집계 제외' : `${formatAmount(isDebt ? getDebtBalance(asset.balance) : asset.balance)}원`}
                            </span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === asset.id ? null : asset.id) }}
                            className="ml-2 inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-[var(--color-border)] transition-colors"
                            aria-label="자산 메뉴"
                          >
                            <MoreHorizontal size={16} className="text-[var(--color-text-sub)]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {sheetOpen && (
        <AssetForm
          open={sheetOpen}
          onClose={() => { setSheetOpen(false); setEditing(null) }}
          editing={editing}
        />
      )}

      {selectedMenuAsset && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-[max(12px,var(--safe-area-bottom))] md:items-center md:pb-0">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="메뉴 닫기"
            onClick={() => setMenuOpen(null)}
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-[0px_8px_24px_rgba(0,0,0,0.16)]">
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{selectedMenuAsset.name}</p>
            </div>
            <button
              onClick={() => handleMenuAction(selectedMenuAsset, 'edit')}
              className="w-full px-4 py-3 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-sub)] transition-colors"
            >
              수정
            </button>
            <button
              onClick={() => handleMenuAction(selectedMenuAsset, 'toggle-included')}
              className="w-full px-4 py-3 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-sub)] transition-colors"
            >
              {selectedMenuAsset.visible ? '집계 제외' : '집계 포함'}
            </button>
            <button
              onClick={() => handleMenuAction(selectedMenuAsset, 'delete')}
              className="w-full px-4 py-3 text-left text-sm text-[var(--color-expense)] hover:bg-[var(--color-surface-sub)] transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--color-surface)] rounded-2xl p-6 mx-4 max-w-sm w-full shadow-[0px_8px_24px_rgba(0,0,0,0.16)]">
            <p className="text-[16px] font-semibold text-[var(--color-text)] mb-2">자산을 삭제할까요?</p>
              <p className="text-sm text-[var(--color-text-sub)] mb-6">
                &ldquo;{deleteTarget.name}&rdquo;은 목록에서 숨겨지고 연결된 거래는 그대로 유지됩니다.
              </p>
            <div className="flex gap-3">
              <button
                className="flex-1 h-12 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] text-[15px] font-medium"
                onClick={() => setDeleteTarget(null)}
              >
                취소
              </button>
              <button
                className="flex-1 h-12 rounded-xl bg-[var(--color-expense)] text-white text-[15px] font-semibold"
                onClick={confirmDelete}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
