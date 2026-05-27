'use client'

import type { ReactNode } from 'react'
import { formatAmount } from '@/lib/utils'

interface SparkBar {
  value: number
  isActive: boolean
}

interface Props {
  label: string
  amount: number
  badge?: string
  badgePositive?: boolean
  icon: ReactNode
  sparks: SparkBar[]
  amountColor?: string
}

export default function KpiCard({ label, amount, badge, badgePositive, icon, sparks, amountColor }: Props) {
  const maxVal = Math.max(...sparks.map(s => Math.abs(s.value)), 1)

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex min-h-[184px] min-w-0 flex-col justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-[var(--color-text-sub)]">{label}</p>
          <div className="shrink-0 text-[var(--color-text-sub)]">{icon}</div>
        </div>
        <p className={`whitespace-nowrap text-lg font-bold leading-tight tabular-nums min-[380px]:text-xl ${amountColor ?? 'text-[var(--color-text)]'}`}>
          {formatAmount(amount)}
          <span className="ml-0.5 align-baseline text-xs font-normal min-[380px]:text-sm">원</span>
        </p>
        {badge && (
          <p className={`mt-1 line-clamp-2 min-h-8 text-xs font-medium leading-4 ${badgePositive ? 'text-[var(--color-income)]' : 'text-[var(--color-text-sub)]'}`}>
            {badge}
          </p>
        )}
      </div>

      {/* 스파크라인 */}
      <div className="flex h-8 items-end gap-0.5">
        {sparks.map((bar, i) => {
          const h = Math.max(4, Math.round((Math.abs(bar.value) / maxVal) * 32))
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all"
              style={{
                height: `${h}px`,
                backgroundColor: bar.isActive ? 'var(--color-primary)' : 'var(--color-border-strong)',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
