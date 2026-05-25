import type { Budget } from './types'
import { getMonthRange } from './monthStart'

export function getBudgetForMonth(budgets: Budget[], categoryId: string, year: number, month: number): number {
  const direct = budgets.find(b => b.year === year && b.month === month && b.category_id === categoryId)
  if (direct) return direct.amount

  let y = year
  let m = month - 1
  for (let i = 0; i < 24; i++) {
    if (m < 1) {
      m = 12
      y--
    }
    const found = budgets.find(b => b.year === y && b.month === m && b.category_id === categoryId)
    if (found) return found.amount
    m--
  }
  return 0
}

export function isDirectBudget(budgets: Budget[], categoryId: string, year: number, month: number): boolean {
  return budgets.some(b => b.year === year && b.month === month && b.category_id === categoryId)
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getBudgetPace(totalBudget: number, spent: number, year: number, month: number, monthStartDay: number) {
  const { from, to } = getMonthRange(year, month, monthStartDay)
  const now = new Date()
  const today = formatLocalDate(now)
  const periodStart = new Date(`${from}T00:00:00`)
  const periodEnd = new Date(`${to}T00:00:00`)
  const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1
  const isCurrentPeriod = today >= from && today <= to
  const elapsedDays = isCurrentPeriod
    ? Math.round((now.getTime() - periodStart.getTime()) / 86400000) + 1
    : today > to ? totalDays : 0
  const dayPct = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0
  const spendPct = totalBudget > 0 ? (spent / totalBudget) * 100 : 0
  const remaining = totalBudget - spent
  const remainingDays = Math.max(totalDays - elapsedDays, 0)
  const projectedSpend = elapsedDays > 0 ? Math.round((spent / elapsedDays) * totalDays) : 0

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    isCurrentPeriod,
    dayPct,
    clampedDayPct: Math.max(4, Math.min(96, dayPct)),
    spendPct,
    remaining,
    projectedSpend,
  }
}
