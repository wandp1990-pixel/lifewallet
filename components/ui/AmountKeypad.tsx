'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { formatAmount } from '@/lib/utils'
import { applyOp, fmtKorean, OP_SYMBOL, type Op } from '@/lib/calc'

// 내역 추가 시트의 계산기 키패드와 동일한 입력 모델. 금액 입력이 필요한 모든 화면이 공유한다.
export function useAmountCalculator(initialValue = 0) {
  // digits=현재 입력 중 숫자, acc=누산값, op=대기 연산자 (내역 추가 시트와 동일)
  const [digits, setDigits] = useState(initialValue > 0 ? String(Math.round(initialValue)) : '')
  const [acc, setAcc] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)

  const value = useMemo(() => {
    const cur = digits === '' ? null : parseInt(digits, 10)
    let val: number
    if (op !== null && acc !== null) {
      val = cur === null ? acc : applyOp(acc, op, cur)
    } else {
      val = cur ?? 0
    }
    return Math.max(0, Math.round(val))
  }, [digits, acc, op])

  const exprHint = op !== null && acc !== null
    ? `${acc.toLocaleString('ko-KR')} ${OP_SYMBOL[op]}${digits ? ' ' + parseInt(digits, 10).toLocaleString('ko-KR') : ''}`
    : ''

  function pressDigit(d: string) {
    setDigits(prev => {
      if (prev.length >= 9) return prev
      if (prev === '' && d === '0') return prev
      return prev + d
    })
  }

  function pressOp(nextOp: Op) {
    if (digits === '') {
      if (acc !== null) setOp(nextOp)
      return
    }
    const cur = parseInt(digits, 10)
    if (acc === null || op === null) {
      setAcc(cur)
    } else {
      setAcc(applyOp(acc, op, cur))
    }
    setOp(nextOp)
    setDigits('')
  }

  function pressEquals() {
    if (op === null || acc === null || digits === '') return
    const result = Math.max(0, Math.round(applyOp(acc, op, parseInt(digits, 10))))
    setAcc(null)
    setOp(null)
    setDigits(String(result))
  }

  function pressBackspace() {
    if (digits !== '') {
      setDigits(prev => prev.slice(0, -1))
    } else if (op !== null) {
      setOp(null)
    }
  }

  function clear() {
    setDigits('')
    setAcc(null)
    setOp(null)
  }

  return { value, exprHint, op, pressDigit, pressOp, pressEquals, pressBackspace, clear }
}

// ── 키패드 버튼 (내역 추가 시트 KeyBtn과 동일 스타일) ──
function KeyBtn({ onClick, children, variant = 'digit', span2 }: { onClick: () => void; children: ReactNode; variant?: 'digit' | 'op' | 'op-active' | 'util'; span2?: boolean }) {
  const base = 'h-12 rounded-xl border text-[18px] font-semibold active:opacity-70 transition-colors flex items-center justify-center'
  const styles: Record<string, string> = {
    digit: 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]',
    op: 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-primary)]',
    'op-active': 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white',
    util: 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-sub)]',
  }
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles[variant]}`} style={span2 ? { gridColumn: 'span 2' } : undefined}>
      {children}
    </button>
  )
}

interface AmountKeypadProps {
  initialValue?: number
  onConfirm: (value: number) => void
  toneColor?: string
  confirmLabel?: string
}

// 미리보기 + 계산기 그리드 + 확인 버튼. 오른쪽 아래 버튼은 연산 대기 중이면 '=', 아니면 확인.
export default function AmountKeypad({ initialValue = 0, onConfirm, toneColor = 'var(--color-primary)', confirmLabel = '확인' }: AmountKeypadProps) {
  const calc = useAmountCalculator(initialValue)
  const { value, exprHint, op } = calc

  return (
    <div style={{ padding: `8px 12px calc(8px + env(safe-area-inset-bottom, 0px))` }}>
      {/* 미리보기: 수식 힌트 + 평가 금액 */}
      <div className="flex items-end justify-between px-1 pb-2">
        <span className="text-[12px] text-[var(--color-text-sub)] tabular-nums">{exprHint || (value > 0 ? fmtKorean(value) : '')}</span>
        <span className="tabular-nums font-bold leading-none" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, color: toneColor }}>
          {formatAmount(value)}<span className="ml-0.5 text-[15px] font-semibold text-[var(--color-text-sub)]">원</span>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {/* Row 1: 연산자 */}
        {(['/', '*', '-', '+'] as Op[]).map(o => (
          <KeyBtn key={o} onClick={() => calc.pressOp(o)} variant={op === o ? 'op-active' : 'op'}>{OP_SYMBOL[o]}</KeyBtn>
        ))}
        {/* Row 2 */}
        {['7', '8', '9'].map(d => <KeyBtn key={d} onClick={() => calc.pressDigit(d)}>{d}</KeyBtn>)}
        <KeyBtn onClick={calc.pressBackspace} variant="util">⌫</KeyBtn>
        {/* Row 3 */}
        {['4', '5', '6'].map(d => <KeyBtn key={d} onClick={() => calc.pressDigit(d)}>{d}</KeyBtn>)}
        <KeyBtn onClick={calc.clear} variant="util">C</KeyBtn>
        {/* Row 4 */}
        {['1', '2', '3'].map(d => <KeyBtn key={d} onClick={() => calc.pressDigit(d)}>{d}</KeyBtn>)}
        <KeyBtn onClick={calc.pressEquals} variant="op">=</KeyBtn>
        {/* Row 5 */}
        <KeyBtn onClick={() => calc.pressDigit('0')} span2>0</KeyBtn>
        <button
          type="button"
          onClick={() => (op !== null ? calc.pressEquals() : onConfirm(value))}
          className="h-12 rounded-xl text-white text-[15px] font-semibold flex items-center justify-center gap-1 active:opacity-80 transition-opacity"
          style={{ gridColumn: 'span 2', background: toneColor }}
        >
          {op !== null ? '=' : confirmLabel}
        </button>
      </div>
    </div>
  )
}
