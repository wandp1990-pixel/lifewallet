'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatAmount } from '@/lib/utils'

interface MonthData {
  label: string
  income: number
  expense: number
}

interface Props {
  data: MonthData[]
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; color: string; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.12)] text-xs">
      <p className="font-semibold text-[var(--color-text)] mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatAmount(p.value)}원
        </p>
      ))}
    </div>
  )
}

export default function TrendChart({ data }: Props) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
      <p className="text-sm font-semibold text-[var(--color-text)] mb-1">월별 수입·유출 추이</p>
      <p className="text-xs text-[var(--color-text-sub)] mb-4">최근 {data.length}개월</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-sub)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-sub)' }} tickFormatter={v => `${Math.round(v / 10000)}만`} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="income" stroke="var(--color-income)" strokeWidth={2} dot={false} name="수입" />
          <Line type="monotone" dataKey="expense" stroke="var(--color-expense)" strokeWidth={2} dot={false} name="유출" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
