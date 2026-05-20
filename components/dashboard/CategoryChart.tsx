'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatAmount } from '@/lib/utils'
import { categoryColor } from '@/lib/colors'
import type { Transaction, Category } from '@/lib/types'

interface Props {
  transactions: Transaction[]
  categories: Category[]
  yearMonth: string
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { color: string } }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.12)] text-xs">
      <p className="font-semibold text-[var(--color-text)]">{payload[0].name}</p>
      <p className="text-[var(--color-text-body)]">{formatAmount(payload[0].value)}원</p>
    </div>
  )
}

export default function CategoryChart({ transactions, categories, yearMonth }: Props) {
  const expenses = transactions.filter(t => t.type === 'expense')
  const total = expenses.reduce((s, t) => s + t.amount, 0)

  const byCategory = expenses.reduce<Record<string, number>>((acc, t) => {
    const key = t.category_id || '__unknown__'
    acc[key] = (acc[key] || 0) + t.amount
    return acc
  }, {})

  const data = Object.entries(byCategory)
    .map(([id, amount]) => ({
      id,
      name: id === '__unknown__' ? '미분류' : (categories.find(c => c.id === id)?.name ?? '삭제된 분류'),
      amount,
      color: id === '__unknown__' ? 'var(--color-border-strong)' : categoryColor(id),
    }))
    .sort((a, b) => b.amount - a.amount)

  if (data.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
        <p className="text-sm font-semibold text-[var(--color-text)] mb-1">카테고리별 지출</p>
        <p className="text-xs text-[var(--color-text-sub)] mb-4">{yearMonth}</p>
        <p className="text-sm text-center text-[var(--color-text-sub)] py-8">지출 내역이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
      <p className="text-sm font-semibold text-[var(--color-text)] mb-1">카테고리별 지출</p>
      <p className="text-xs text-[var(--color-text-sub)] mb-4">{yearMonth}</p>
      <div className="flex gap-4 items-center">
        <div className="relative flex-shrink-0">
          <ResponsiveContainer width={120} height={120}>
            <PieChart>
              <Pie data={data} dataKey="amount" innerRadius={35} outerRadius={55} strokeWidth={0}>
                {data.map(d => <Cell key={d.id} fill={d.color} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] text-[var(--color-text-sub)]">총 지출</p>
            <p className="text-xs font-bold text-[var(--color-text)] tabular-nums">{Math.round(total / 10000)}만</p>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-hidden">
          {data.slice(0, 5).map(d => (
            <div key={d.id} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-xs text-[var(--color-text-body)] flex-1 truncate">{d.name}</span>
              <span className="text-xs font-medium text-[var(--color-text)] tabular-nums flex-shrink-0">
                {Math.round((d.amount / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
