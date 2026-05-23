import type { Budget } from './types'

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
