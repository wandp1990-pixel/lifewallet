'use client'

import { useState, useEffect } from 'react'
import { isDebtAssetType, validateTransactionInput } from '@/lib/finance'
import { useStore } from '@/lib/store'
import { todayStr } from '@/lib/utils'
import type { Transaction } from '@/lib/types'
import CatIcon from '@/components/ui/CatIcon'

type TxType = 'expense' | 'income' | 'transfer' | 'loan_repayment'

const TYPE_LABELS: Record<TxType, string> = {
  expense: '지출', income: '수입', transfer: '이체', loan_repayment: '대출상환',
}
const TYPES: TxType[] = ['income', 'expense', 'transfer', 'loan_repayment']

function fmtDisplay(digits: string): string {
  if (!digits) return '0'
  return parseInt(digits, 10).toLocaleString('ko-KR')
}

function fmtInput(s: string): string {
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('ko-KR')
}

function parseInput(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0
}

function withSelectedAssets<T extends { id: string }>(base: T[], all: T[], selectedIds: string[]): T[] {
  const map = new Map(base.map(asset => [asset.id, asset]))
  for (const id of selectedIds.filter(Boolean)) {
    const selected = all.find(asset => asset.id === id)
    if (selected && !map.has(id)) map.set(id, selected)
  }
  return Array.from(map.values())
}

function fmtKorean(n: number): string {
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

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  mode?: 'new' | 'edit'
  initial?: Transaction
  transactionId?: string
}

export default function AddTransactionSheet({ open, onClose, onSaved, mode = 'new', initial, transactionId }: Props) {
  const { categories, assets } = useStore()

  const [type, setType] = useState<TxType>('expense')
  const [digits, setDigits] = useState('')
  const [catId, setCatId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [fromAssetId, setFromAssetId] = useState('')
  const [toAssetId, setToAssetId] = useState('')
  const [feeStr, setFeeStr] = useState('')
  const [date, setDate] = useState(todayStr())
  const [content, setContent] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [catExpanded, setCatExpanded] = useState(false)

  const amount = parseInt(digits || '0', 10)
  const fee = parseInput(feeStr)
  const visibleAssets = assets.filter(a => a.visible)
  const loanAssets = visibleAssets.filter(a => a.group_type === 'loan')
  const repaymentFromAssets = visibleAssets.filter(a => !isDebtAssetType(a.group_type))
  const singleAssetOptions = withSelectedAssets(visibleAssets, assets, [assetId])
  const currentCats = categories.filter(c => c.type === (type === 'income' ? 'income' : 'expense'))

  const showCategory = type === 'expense' || type === 'income'
  const showFromTo = type === 'transfer' || type === 'loan_repayment'

  const isValid = validateTransactionInput({
    type,
    amount,
    category_id: showCategory ? catId : '',
    asset_id: showCategory ? assetId : '',
    from_asset_id: showFromTo ? fromAssetId : '',
    to_asset_id: showFromTo ? toAssetId : '',
    fee: type === 'loan_repayment' ? fee : 0,
  }, assets) === null

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      const rawType = initial.type
      const t: TxType = rawType === 'income' || rawType === 'transfer' || rawType === 'loan_repayment' ? rawType : 'expense'
      setType(t)
      setDigits(initial.amount > 0 ? String(initial.amount) : '')
      setCatId(initial.category_id ?? '')
      setAssetId(initial.asset_id ?? '')
      setFromAssetId(initial.from_asset_id ?? '')
      setToAssetId(initial.to_asset_id ?? '')
      setFeeStr(initial.fee > 0 ? initial.fee.toLocaleString('ko-KR') : '')
      setDate(initial.date ?? todayStr())
      setContent(initial.content ?? '')
      setNote(initial.note ?? '')
    } else {
      setType('expense')
      setDigits('')
      setCatId('')
      setAssetId(visibleAssets[0]?.id ?? '')
      setFromAssetId(visibleAssets[0]?.id ?? '')
      setToAssetId(loanAssets[0]?.id ?? visibleAssets[1]?.id ?? '')
      setFeeStr('')
      setContent('')
      setNote('')
      setDate(todayStr())
    }
    setSaving(false)
    setCatExpanded(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  function handleType(t: TxType) {
    setType(t)
    setCatId('')
    setCatExpanded(false)
    if (t === 'loan_repayment') {
      setToAssetId(loanAssets[0]?.id ?? '')
      setFromAssetId(repaymentFromAssets[0]?.id ?? '')
    } else if (t === 'transfer') {
      setToAssetId(visibleAssets.find(a => a.id !== fromAssetId)?.id ?? '')
      setFeeStr('')
    }
  }

  function onDigitPress(d: string) {
    setDigits(prev => {
      if (prev.length >= 9) return prev
      if (prev === '' && d === '0') return prev
      return prev + d
    })
  }

  function onBackspace() {
    setDigits(prev => prev.slice(0, -1))
  }

  async function submit(continueAdding: boolean) {
    if (!isValid || saving) return
    setSaving(true)

    const payload = {
      type,
      amount,
      date,
      category_id: showCategory ? catId : '',
      asset_id: showCategory ? assetId : '',
      from_asset_id: showFromTo ? fromAssetId : '',
      to_asset_id: showFromTo ? toAssetId : '',
      content,
      note,
      fee: type === 'loan_repayment' ? fee : 0,
    }

    try {
      const url = mode === 'edit' && transactionId
        ? `/api/transactions/${transactionId}`
        : '/api/transactions'
      const res = await fetch(url, {
        method: mode === 'edit' && transactionId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        onSaved?.()
        if (continueAdding) {
          setDigits('')
          setContent('')
          setNote('')
          setSaving(false)
        } else {
          onClose()
        }
      } else {
        setSaving(false)
      }
    } catch {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!transactionId) return
    if (!confirm('거래를 삭제하시겠습니까?')) return
    const res = await fetch(`/api/transactions/${transactionId}`, { method: 'DELETE' })
    if (res.ok) {
      onSaved?.()
      onClose()
    }
  }

  const toneColor =
    type === 'income' ? 'var(--color-income)' :
    type === 'expense' ? 'var(--color-expense)' :
    'var(--color-primary)'

  if (!open) return null

  const visibleCats = catExpanded ? currentCats : currentCats.slice(0, 8)
  const fromAssets = withSelectedAssets(type === 'loan_repayment' ? repaymentFromAssets : visibleAssets, assets, [fromAssetId])
  const toAssets = withSelectedAssets(type === 'loan_repayment'
    ? loanAssets.filter(a => a.id !== fromAssetId)
    : visibleAssets.filter(a => a.id !== fromAssetId), assets, [toAssetId])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[59]"
        style={{
          background: 'rgba(2,9,19,0.5)',
          animation: 'tds-fade-in 180ms ease-out both',
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-[var(--color-surface)] rounded-t-[18px]"
        style={{
          height: '92%',
          boxShadow: '0 -8px 28px rgba(0,0,0,0.18)',
          animation: 'sheet-slide-up 240ms cubic-bezier(0.2,0.7,0.3,1) both',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-strong)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
          <button
            onClick={onClose}
            className="text-[14px] text-[var(--color-text-sub)] min-w-[44px]"
          >취소</button>
          <span className="text-[16px] font-semibold text-[var(--color-text)]">
            {mode === 'edit' ? '거래 수정' : '내역 추가'}
          </span>
          <div className="flex items-center gap-3">
            {mode === 'new' && (
              <button
                onClick={() => submit(true)}
                disabled={!isValid || saving}
                className="text-[14px] text-[var(--color-text-sub)] disabled:opacity-40"
              >계속</button>
            )}
            {mode === 'edit' && (
              <button
                onClick={handleDelete}
                className="text-[14px] text-[var(--color-expense)]"
              >삭제</button>
            )}
            <button
              onClick={() => submit(false)}
              disabled={!isValid || saving}
              className="text-[14px] font-semibold text-[var(--color-primary)] disabled:opacity-40"
            >저장</button>
          </div>
        </div>

        {/* Type tabs */}
        <div className="shrink-0 mx-4 mb-2">
          <div className="grid grid-cols-4 p-[3px] bg-[var(--color-surface-sub)] rounded-xl">
            {TYPES.map(t => (
              <button
                key={t}
                onClick={() => handleType(t)}
                className={`py-1.5 text-[13px] font-medium rounded-[9px] transition-colors ${
                  type === t
                    ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]'
                    : 'text-[var(--color-text-sub)]'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Amount display */}
        <div className="shrink-0 px-4 pb-1">
          <div
            className="text-right tabular-nums leading-none"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 30,
              fontWeight: 700,
              color: toneColor,
            }}
          >
            {fmtDisplay(digits)}
            <span
              className="ml-1"
              style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-sub)' }}
            >원</span>
          </div>
          {amount > 0 && (
            <p
              className="text-right text-[12px] mt-0.5 tabular-nums"
              style={{ color: 'var(--color-text-sub)' }}
            >
              {fmtKorean(amount)}
            </p>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-3 pb-2 space-y-4">

          {/* Category */}
          {showCategory && (
            <div>
              <p className="text-[12px] font-medium mb-2 text-[var(--color-text-sub)]">분류</p>
              <div className="flex flex-wrap gap-2">
                {visibleCats.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCatId(c.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
                      catId === c.id
                        ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'bg-[var(--color-surface-sub)] text-[var(--color-text-body)] border-transparent'
                    }`}
                  >
                    <CatIcon icon={c.icon || '📦'} id={c.id} size={22} />
                    {c.name}
                  </button>
                ))}
                {currentCats.length > 8 && (
                  <button
                    onClick={() => setCatExpanded(v => !v)}
                    className="px-2.5 py-1.5 rounded-full text-[13px] text-[var(--color-text-sub)] bg-[var(--color-surface-sub)] border border-transparent"
                  >
                    {catExpanded ? '접기' : `+${currentCats.length - 8}`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Asset (income/expense) */}
          {showCategory && (
            <div>
              <p className="text-[12px] font-medium mb-2 text-[var(--color-text-sub)]">자산</p>
              <div className="flex flex-wrap gap-2">
                {singleAssetOptions.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setAssetId(a.id)}
                    className={`px-2.5 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
                      assetId === a.id
                        ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'bg-[var(--color-surface-sub)] text-[var(--color-text-body)] border-transparent'
                    }`}
                  >
                    {a.name}{!a.visible ? ' (숨김)' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* From/To (transfer/loan_repayment) */}
          {showFromTo && (
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-medium mb-2 text-[var(--color-text-sub)]">출금 계좌</p>
                <div className="flex flex-wrap gap-2">
                  {fromAssets.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setFromAssetId(a.id)}
                      className={`px-2.5 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
                        fromAssetId === a.id
                          ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]'
                          : 'bg-[var(--color-surface-sub)] text-[var(--color-text-body)] border-transparent'
                      }`}
                    >
                      {a.name}{!a.visible ? ' (숨김)' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium mb-2 text-[var(--color-text-sub)]">
                  {type === 'loan_repayment' ? '대출 계좌' : '입금 계좌'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {toAssets.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setToAssetId(a.id)}
                      className={`px-2.5 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
                        toAssetId === a.id
                          ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]'
                          : 'bg-[var(--color-surface-sub)] text-[var(--color-text-body)] border-transparent'
                      }`}
                    >
                      {a.name}{!a.visible ? ' (숨김)' : ''}
                    </button>
                  ))}
                </div>
              </div>
              {type === 'loan_repayment' && (
                <div>
                  <p className="text-[12px] font-medium mb-2 text-[var(--color-text-sub)]">이자 금액 (선택)</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={feeStr}
                    onChange={e => setFeeStr(fmtInput(e.target.value))}
                    placeholder="0"
                    className="tds-field !py-2.5 !text-[15px] text-right"
                  />
                </div>
              )}
            </div>
          )}

          {/* Date */}
          <div>
            <p className="text-[12px] font-medium mb-2 text-[var(--color-text-sub)]">날짜</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="tds-field flex-1 min-w-0 !py-2.5 !text-[15px]"
              />
              <button
                onClick={() => setDate(todayStr())}
                className="px-3 py-2.5 text-[13px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary-subtle)] rounded-xl shrink-0"
              >오늘</button>
            </div>
          </div>

          {/* Content */}
          <div>
            <p className="text-[12px] font-medium mb-2 text-[var(--color-text-sub)]">내용</p>
            <input
              type="text"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={
                type === 'income' ? '예: 5월 급여' :
                type === 'transfer' ? '예: 이체 메모' :
                type === 'loan_repayment' ? '예: 대출 상환' :
                '예: 점심 식사'
              }
              className="tds-field !py-2.5 !text-[15px]"
            />
          </div>

          {/* Note */}
          <div>
            <p className="text-[12px] font-medium mb-2 text-[var(--color-text-sub)]">메모 (선택)</p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="메모를 입력하세요"
              className="tds-field !py-2.5 !text-[15px]"
            />
          </div>
        </div>

        {/* Keypad */}
        <div
          className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface-sub)]"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            padding: `8px 12px calc(8px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button
              key={d}
              onClick={() => onDigitPress(d)}
              className="h-12 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[18px] font-semibold text-[var(--color-text)] active:bg-[var(--color-border)] transition-colors"
            >{d}</button>
          ))}
          <button
            onClick={() => setDigits('')}
            className="h-12 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] font-semibold text-[var(--color-text-sub)] active:bg-[var(--color-border)] transition-colors"
          >C</button>
          <button
            onClick={() => onDigitPress('0')}
            className="h-12 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[18px] font-semibold text-[var(--color-text)] active:bg-[var(--color-border)] transition-colors"
          >0</button>
          <button
            onClick={onBackspace}
            className="h-12 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[18px] font-medium text-[var(--color-text-sub)] active:bg-[var(--color-border)] transition-colors"
          >⌫</button>
          {/* Confirm — spans entire right column, all 4 rows */}
          <button
            onClick={() => submit(false)}
            disabled={!isValid || saving}
            className="rounded-xl text-white flex flex-col items-center justify-center gap-1 disabled:opacity-50 active:opacity-80 transition-opacity"
            style={{
              gridColumn: '4 / 5',
              gridRow: '1 / 5',
              background: toneColor,
            }}
          >
            <span className="text-[22px] leading-none">✓</span>
            <span className="text-[13px] font-semibold leading-none">저장</span>
          </button>
        </div>
      </div>
    </>
  )
}
