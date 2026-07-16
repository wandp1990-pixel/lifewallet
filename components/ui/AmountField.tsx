'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatAmount } from '@/lib/utils'
import AmountKeypad from '@/components/ui/AmountKeypad'

interface AmountFieldProps {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  suffix?: string
  /** 표시 크기: lg=큰 금액 필드(잔액 등), md=보조 금액 필드(원금·월상환액 등) */
  size?: 'lg' | 'md'
  toneColor?: string
  /** 키패드 시트 상단 제목 */
  title?: string
  ariaLabel?: string
}

// OS 키보드 대신 앱 내장 계산기 키패드로 금액을 입력하는 필드.
// 탭하면 화면 하단에 키패드가 뜬다(포털 → body, 조상 transform 영향 없음).
export default function AmountField({
  value,
  onChange,
  placeholder = '0',
  suffix = '원',
  size = 'lg',
  toneColor = 'var(--color-primary)',
  title = '금액 입력',
  ariaLabel,
}: AmountFieldProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // 키패드가 열려 있는 동안 Esc로 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const numberCls = size === 'lg'
    ? 'text-[22px] font-bold text-[var(--color-text)]'
    : 'text-[16px] text-[var(--color-text)]'
  const suffixCls = size === 'lg'
    ? 'text-base font-bold text-[var(--color-text-sub)]'
    : 'text-sm text-[var(--color-text-sub)]'
  const padY = size === 'lg' ? 'py-3' : 'py-2.5'
  const padX = size === 'lg' ? 'px-4' : 'px-3'

  const overlay = open && mounted ? createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="tds-fade-in absolute inset-0 bg-[rgba(2,9,19,0.5)]" onClick={() => setOpen(false)} aria-hidden />
      <div className="tds-slide-up relative w-full rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-surface-sub)] shadow-[0px_-8px_24px_rgba(0,0,0,0.16)] md:max-w-[480px] md:rounded-2xl">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-[13px] font-medium text-[var(--color-text-sub)]">{title}</span>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-[var(--color-text-body)] px-2 py-1" aria-label="닫기">닫기</button>
        </div>
        <AmountKeypad
          initialValue={value}
          toneColor={toneColor}
          confirmLabel="확인"
          onConfirm={v => { onChange(v); setOpen(false) }}
        />
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel ?? title}
        className={`flex w-full items-center gap-2 rounded-xl ${padX} overflow-hidden text-left`}
        style={{ background: 'rgba(0,23,51,0.02)', border: '1px solid rgba(2,32,71,0.05)' }}
      >
        <span className={`flex-1 min-w-0 text-right tabular-nums ${padY} ${value > 0 ? numberCls : `${numberCls} !text-[var(--color-text-placeholder)] !font-normal`}`}>
          {value > 0 ? formatAmount(value) : placeholder}
        </span>
        <span className={`shrink-0 ${suffixCls}`}>{suffix}</span>
      </button>
      {overlay}
    </>
  )
}
