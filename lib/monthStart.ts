export const MONTH_START_KEY = 'lw_month_start_day'

export function getMonthStartDay(): number {
  if (typeof window === 'undefined') return 1
  const v = parseInt(localStorage.getItem(MONTH_START_KEY) ?? '1', 10)
  if (isNaN(v) || v < 1 || v > 28) return 1
  return v
}

export function setMonthStartDay(day: number) {
  if (typeof window === 'undefined') return
  localStorage.setItem(MONTH_START_KEY, String(day))
}

export function getDisplayMonth(date: Date, startDay: number): { year: number; month: number } {
  const base = new Date(date)
  if (startDay > 1 && base.getDate() < startDay) {
    base.setMonth(base.getMonth() - 1)
  }
  return {
    year: base.getFullYear(),
    month: base.getMonth() + 1,
  }
}

// Returns the actual date range for a given display month (year/month) with custom start day.
// e.g. startDay=25, month=5 → from=2026-05-25, to=2026-06-24
export function getMonthRange(year: number, month: number, startDay: number): { from: string; to: string } {
  if (startDay <= 1) {
    const lastDay = new Date(year, month, 0).getDate()
    return {
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  const fromDate = new Date(year, month - 1, startDay)
  const toDate = new Date(year, month, startDay - 1)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: fmt(fromDate), to: fmt(toDate) }
}

export function getDateInDisplayMonth(
  year: number,
  month: number,
  dayOfMonth: number,
  startDay: number
): string {
  const safeDay = Math.min(31, Math.max(1, Math.trunc(dayOfMonth) || 1))
  const safeStartDay = startDay >= 1 && startDay <= 28 ? startDay : 1
  const targetMonthIndex = safeStartDay <= 1 || safeDay >= safeStartDay
    ? month - 1
    : month
  const maxDay = new Date(year, targetMonthIndex + 1, 0).getDate()
  const date = new Date(year, targetMonthIndex, Math.min(safeDay, maxDay))

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
