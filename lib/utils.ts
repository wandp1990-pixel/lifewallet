export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.abs(amount))
}

export function formatDate(date: string): string {
  const value = date?.trim()
  if (!value) return '날짜 없음'

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(parsed)
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
