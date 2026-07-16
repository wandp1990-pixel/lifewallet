// 금액 입력용 계산기 공용 모델. 내역 추가 시트와 공용 AmountField 키패드가 함께 쓴다.
// 이 파일이 연산자·포맷 헬퍼의 단일 소스 — 화면마다 복붙하지 않는다.

export type Op = '+' | '-' | '*' | '/'

export const OP_SYMBOL: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

export function applyOp(a: number, op: Op, b: number): number {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? a : a / b
  }
}

// 천 단위 콤마 문자열 (입력 필드 표시용)
export function fmtInput(s: string): string {
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('ko-KR')
}

// 콤마 문자열 → 정수
export function parseInput(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0
}

// 억/만 한글 읽기 (키패드 미리보기 보조 표기)
export function fmtKorean(n: number): string {
  if (!n) return ''
  const eok = Math.floor(n / 100000000)
  const man = Math.floor((n % 100000000) / 10000)
  const rest = n % 10000
  const parts: string[] = []
  if (eok) parts.push(`${eok}억`)
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`)
  if (rest) parts.push(rest.toLocaleString('ko-KR'))
  return parts.join(' ') + '원'
}
