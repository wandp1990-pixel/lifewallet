'use client'

import { useState, useEffect } from 'react'
import { getMonthStartDay, setMonthStartDay } from '@/lib/monthStart'

export default function MonthStartSetting() {
  const [day, setDay] = useState(1)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDay(getMonthStartDay())
  }, [])

  function handleChange(newDay: number) {
    setMonthStartDay(newDay)
    setDay(newDay)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <li className="border-b border-[var(--color-border)] last:border-b-0">
      <div className="flex items-center justify-between px-4 py-3.5">
        <span className="text-[15px] text-[var(--color-text)]">월 시작일</span>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-[var(--color-income)]">저장됨</span>}
          <select
            value={day}
            onChange={e => handleChange(Number(e.target.value))}
            className="rounded-lg bg-[var(--color-surface-sub)] border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>{d}일</option>
            ))}
          </select>
        </div>
      </div>
    </li>
  )
}
