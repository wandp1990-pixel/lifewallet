export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.abs(amount))
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date))
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
