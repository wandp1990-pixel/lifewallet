'use client'

import { formatAmount } from '@/lib/utils'
import { getDebtBalance, isDebtAssetType, isLoanPaidOff } from '@/lib/finance'
import PaidOffBadge from '@/components/ui/PaidOffBadge'
import type { Asset } from '@/lib/types'

interface Props {
  assets: Asset[]
}

export default function AssetSummary({ assets }: Props) {
  const visible = assets.filter(a => a.visible)
  const totalAssets = visible.filter(a => !isDebtAssetType(a.group_type)).reduce((s, a) => s + a.balance, 0)
  const totalDebts = visible.filter(a => isDebtAssetType(a.group_type)).reduce((s, a) => s + getDebtBalance(a.balance), 0)
  const managedBalance = totalAssets - totalDebts

  const tracked = visible.filter(a => a.track_detail)

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
      <p className="text-sm font-semibold text-[var(--color-text)] mb-3">자산 현황</p>
      <p className="text-2xl font-bold text-[var(--color-text)] tabular-nums mb-1">
        {formatAmount(managedBalance)}원
      </p>
      <p className="text-xs text-[var(--color-text-sub)] mb-3">관리 잔액 (관리 자산 {formatAmount(totalAssets)}원 − 관리 부채 {formatAmount(totalDebts)}원)</p>
      {tracked.length > 0 && (
        <div className="space-y-1.5">
          {tracked.map(a => (
            <div key={a.id} className="flex justify-between text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="text-[var(--color-text-body)] truncate">{a.name}</span>
                {isLoanPaidOff(a) && <PaidOffBadge />}
              </span>
              <span className={`tabular-nums font-medium flex-shrink-0 ${isDebtAssetType(a.group_type) ? 'text-[var(--color-expense)]' : 'text-[var(--color-text)]'}`}>
                {formatAmount(isDebtAssetType(a.group_type) ? getDebtBalance(a.balance) : a.balance)}원
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
