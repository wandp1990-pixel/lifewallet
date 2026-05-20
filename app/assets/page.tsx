'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react'
import { useStore } from '@/lib/store'
import { formatAmount } from '@/lib/utils'
import AssetForm from '@/components/assets/AssetForm'
import type { Asset, AssetGroupType } from '@/lib/types'

const GROUP_ORDER: AssetGroupType[] = [
  'cash', 'bank', 'card', 'check_card', 'prepaid_card',
  'savings', 'investment', 'minus_account', 'loan', 'insurance', 'other',
]

const GROUP_LABELS: Record<AssetGroupType, string> = {
  cash: '현금',
  bank: '은행',
  card: '카드',
  check_card: '체크카드',
  prepaid_card: '선불카드',
  savings: '저축',
  investment: '투자',
  minus_account: '마이너스통장',
  loan: '대출',
  insurance: '보험',
  other: '기타',
}

const DEBT_TYPES: AssetGroupType[] = ['card', 'minus_account', 'loan', 'insurance']

export default function AssetsPage() {
  const router = useRouter()
  const { assets, ready } = useStore()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const visibleAssets = useMemo(
    () => assets.filter(a => showHidden || a.visible),
    [assets, showHidden]
  )

  const groups = useMemo(() => {
    const map = new Map<AssetGroupType, Asset[]>()
    for (const a of visibleAssets) {
      if (!map.has(a.group_type)) map.set(a.group_type, [])
      map.get(a.group_type)!.push(a)
    }
    return GROUP_ORDER
      .filter(g => map.has(g))
      .map(g => ({ type: g, items: map.get(g)!.sort((a, b) => a.order - b.order) }))
  }, [visibleAssets])

  const totalAssets = useMemo(
    () => assets.filter(a => a.visible && !DEBT_TYPES.includes(a.group_type)).reduce((s, a) => s + a.balance, 0),
    [assets]
  )
  const totalDebt = useMemo(
    () => assets.filter(a => a.visible && DEBT_TYPES.includes(a.group_type)).reduce((s, a) => s + a.balance, 0),
    [assets]
  )
  const netAssets = totalAssets - totalDebt

  const trackDetailAssets = useMemo(
    () => assets.filter(a => a.visible && a.track_detail),
    [assets]
  )

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
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold"
          >
            <Plus size={16} />
            자산 추가
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 순자산 카드 */}
          <div className="bg-[var(--color-surface-sub)] rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-xs text-[var(--color-text-sub)] mb-0.5">순자산</p>
              <p className={`text-3xl font-bold ${netAssets >= 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-expense)]'}`}>
                {netAssets < 0 ? '-' : ''}{formatAmount(netAssets)}원
              </p>
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-xs text-[var(--color-text-sub)]">자산 합계</p>
                <p className="font-semibold text-[var(--color-text)]">{formatAmount(totalAssets)}원</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-sub)]">부채 합계</p>
                <p className="font-semibold text-[var(--color-expense)]">{formatAmount(totalDebt)}원</p>
              </div>
            </div>

            {/* 자산 구성 (track_detail ON만) */}
            {trackDetailAssets.length > 0 && (
              <div className="border-t border-[var(--color-border)] pt-3 space-y-1.5">
                {trackDetailAssets.map(a => {
                  const pct = totalAssets > 0 ? Math.round((a.balance / totalAssets) * 100) : 0
                  return (
                    <button
                      key={a.id}
                      onClick={() => router.push(`/assets/${a.id}`)}
                      className="w-full flex items-center justify-between text-sm hover:bg-[var(--color-surface)] rounded-lg px-2 py-1 transition-colors"
                    >
                      <span className="text-[var(--color-text-body)]">{a.name}</span>
                      <span className="text-xs text-[var(--color-text-sub)]">{pct}%</span>
                    </button>
                  )
                })}
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
              const groupTotal = items.reduce((s, a) => s + a.balance, 0)
              const isDebt = DEBT_TYPES.includes(type)
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
                            <span className={`text-sm text-[var(--color-text-body)] ${!asset.visible ? 'opacity-40' : ''}`}>
                              {asset.name}
                            </span>
                            <span className={`text-sm font-semibold ${isDebt ? 'text-[var(--color-expense)]' : 'text-[var(--color-text)]'}`}>
                              {formatAmount(asset.balance)}원
                            </span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === asset.id ? null : asset.id) }}
                            className="ml-2 p-1 rounded-lg hover:bg-[var(--color-border)] transition-colors"
                          >
                            <MoreHorizontal size={16} className="text-[var(--color-text-sub)]" />
                          </button>

                          {/* 더보기 메뉴 */}
                          {menuOpen === asset.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                              <div className="absolute right-2 top-10 z-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden min-w-[100px]">
                                <button
                                  onClick={() => openEdit(asset)}
                                  className="w-full px-4 py-2.5 text-sm text-left text-[var(--color-text)] hover:bg-[var(--color-surface-sub)] transition-colors"
                                >
                                  수정
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* 숨긴 자산 보기 토글 */}
          {assets.some(a => !a.visible) && (
            <button
              onClick={() => setShowHidden(h => !h)}
              className="w-full py-2.5 text-sm text-[var(--color-text-sub)] hover:text-[var(--color-text)] transition-colors"
            >
              {showHidden ? '숨긴 자산 숨기기' : '숨긴 자산 보기'}
            </button>
          )}
        </div>
      </div>

      <AssetForm
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
      />
    </>
  )
}
