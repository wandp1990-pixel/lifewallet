export class LedgerError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}
export function fail(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new LedgerError(code, message, details)
}
export function errorResult(error: unknown) {
  return error instanceof LedgerError
    ? { code: error.code, message: error.message, details: error.details, retryable: false }
    : {
        code: 'STORAGE_ERROR',
        message:
          '저장을 확인할 수 없습니다. 성공으로 간주하지 말고 같은 request_id로 재시도하세요.',
        details: {},
        retryable: true,
      }
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
export function koreaToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
export function ledgerDate(value: unknown, field: string, allowFuture = false): string {
  if (!validDate(value) || value < '1900-01-01' || (!allowFuture && value > koreaToday()))
    fail(
      'INVALID_DATE',
      field +
        ': 한국 시간 기준 실제 YYYY-MM-DD 날짜가 필요합니다. 미래 거래/잔액은 지원하지 않습니다.',
      { field },
    )
  return value
}
export function money(value: unknown, field: string, min = 0): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Math.abs(Number(value)) > 100_000_000_000_000
  )
    fail('INVALID_AMOUNT', field + ': 범위 내 정수 원화 금액이 필요합니다.', {
      field,
      minimum: min,
      maximum: 100_000_000_000_000,
    })
  return Number(value)
}
