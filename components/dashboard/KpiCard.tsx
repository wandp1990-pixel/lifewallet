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
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--color-text-sub)] mb-1">{label}</p>
          <p className={`text-xl font-bold tabular-nums leading-tight ${amountColor ?? 'text-[var(--color-text)]'}`}>
            {formatAmount(amount)}
            <span className="text-sm font-normal ml-0.5">원</span>
          </p>
          {badge && (
            <p className={`text-xs mt-1 font-medium ${badgePositive ? 'text-[var(--color-income)]' : 'text-[var(--color-text-sub)]'}`}>
              {badge}
            </p>
          )}
        </div>
        <div className="text-[var(--color-text-sub)]">{icon}</div>
      </div>

      {/* 스파크라인 */}
      <div className="flex items-end gap-0.5 h-8">
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
