'use client'

import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Repeat, ChevronDown, ChevronRight } from 'lucide-react'
import { isDebtAssetType, isLoanPaidOff, validateTransactionInput } from '@/lib/finance'
import { useStore } from '@/lib/store'
import { formatAmount, todayStr } from '@/lib/utils'
import { getDisplayMonth, getMonthStartDay } from '@/lib/monthStart'
import { groupAssets } from '@/lib/assetGroups'
import type { Asset, RecurringTransaction, Transaction } from '@/lib/types'
import CatIcon from '@/components/ui/CatIcon'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AssetGroupPicker from '@/components/ui/AssetGroupPicker'

type TxType = 'expense' | 'income' | 'transfer' | 'loan_repayment'
type Op = '+' | '-' | '*' | '/'
// 하단 스왑 패널: 활성 필드별로 키패드/분류 그리드/자산 그룹 중 하나를 보여준다. null이면 패널 숨김(텍스트·날짜 입력 중).
type Panel = 'amount' | 'category' | 'asset' | 'from' | 'to' | null

const TYPE_LABELS: Record<TxType, string> = {
  expense: '지출', income: '수입', transfer: '이체', loan_repayment: '대출상환',
}
const TYPES: TxType[] = ['income', 'expense', 'transfer', 'loan_repayment']

const OP_SYMBOL: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

function applyOp(a: number, op: Op, b: number): number {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? a : a / b
  }
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

function withSelectedCategories<T extends { id: string }>(base: T[], all: T[], selectedIds: string[]): T[] {
  const map = new Map(base.map(category => [category.id, category]))
  for (const id of selectedIds.filter(Boolean)) {
    const selected = all.find(category => category.id === id)
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
  onRecurringApplied?: () => void
  mode?: 'new' | 'edit'
  initial?: Transaction
  transactionId?: string
  /** 새 거래 기본 날짜 'YYYY-MM-DD' (달력에서 특정 날 추가 시). 미지정 시 오늘 */
  defaultDate?: string
}

function isSheetTxType(type: string): type is TxType {
  return type === 'expense' || type === 'income' || type === 'transfer' || type === 'loan_repayment'
}

function displayMonthKeyForDate(dateStr: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(`${dateStr}T00:00:00`)
    : new Date(dateStr)
  const displayMonth = getDisplayMonth(Number.isNaN(date.getTime()) ? new Date() : date, getMonthStartDay())
  return `${displayMonth.year}-${String(displayMonth.month).padStart(2, '0')}`
}

export default function AddTransactionSheet({ open, onClose, onSaved, onRecurringApplied, mode = 'new', initial, transactionId, defaultDate }: Props) {
  const { categories, assets } = useStore()

  const [type, setType] = useState<TxType>('expense')
  // 계산기 상태: digits=현재 입력 중 숫자, acc=누산값, op=대기 연산자
  const [digits, setDigits] = useState('')
  const [acc, setAcc] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [catId, setCatId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [fromAssetId, setFromAssetId] = useState('')
  const [toAssetId, setToAssetId] = useState('')
  const [feeStr, setFeeStr] = useState('')
  const [date, setDate] = useState(todayStr())
  const [content, setContent] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [panel, setPanel] = useState<Panel>('amount')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [recurringList, setRecurringList] = useState<RecurringTransaction[]>([])
  const [selectedRecurringId, setSelectedRecurringId] = useState('')

  // 평가된 금액: op가 대기 중이면 누산값과 현재 입력을 계산, 아니면 현재 입력값
  const amount = useMemo(() => {
    const cur = digits === '' ? null : parseInt(digits, 10)
    let val: number
    if (op !== null && acc !== null) {
      val = cur === null ? acc : applyOp(acc, op, cur)
    } else {
      val = cur ?? 0
    }
    return Math.max(0, Math.round(val))
  }, [digits, acc, op])

  const fee = parseInput(feeStr)
  const selectableAssets = assets
  const loanAssets = selectableAssets.filter(a => a.group_type === 'loan')
  const repaymentFromAssets = selectableAssets.filter(a => !isDebtAssetType(a.group_type))
  const currentCats = withSelectedCategories(
    categories.filter(c => c.type === (type === 'income' ? 'income' : 'expense') && c.visible),
    categories,
    [catId]
  )

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
  }, assets, categories, showCategory ? [catId] : []) === null

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
      setSelectedRecurringId('')
    } else {
      setType('expense')
      setDigits('')
      setCatId('')
      setAssetId(selectableAssets[0]?.id ?? '')
      setFromAssetId(selectableAssets[0]?.id ?? '')
      setToAssetId(loanAssets[0]?.id ?? selectableAssets[1]?.id ?? '')
      setFeeStr('')
      setContent('')
      setNote('')
      setDate(defaultDate ?? todayStr())
      setSelectedRecurringId('')
    }
    setAcc(null)
    setOp(null)
    setPanel('amount')
    setSaving(false)
    setDeleteConfirmOpen(false)
    setDeleting(false)
    setDeleteError('')
  }, [open])

  useEffect(() => {
    if (!open || mode !== 'new') return
    fetch('/api/recurring')
      .then(r => r.ok ? r.json() : [])
      .then((data: RecurringTransaction[]) => {
        setRecurringList(Array.isArray(data) ? data.filter(r => r.enabled && isSheetTxType(r.type)) : [])
      })
      .catch(() => setRecurringList([]))
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteConfirmOpen) onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose, deleteConfirmOpen])

  function resetCalc(initialDigits = '') {
    setDigits(initialDigits)
    setAcc(null)
    setOp(null)
  }

  function handleType(t: TxType) {
    setType(t)
    setCatId('')
    if (t === 'loan_repayment') {
      setToAssetId(loanAssets[0]?.id ?? '')
      setFromAssetId(repaymentFromAssets[0]?.id ?? '')
    } else if (t === 'transfer') {
      setToAssetId(selectableAssets.find(a => a.id !== fromAssetId)?.id ?? '')
      setFeeStr('')
    }
    setPanel('amount')
  }

  function applyRecurringTemplate(r: RecurringTransaction) {
    if (!isSheetTxType(r.type)) return
    setSelectedRecurringId(r.id)
    setType(r.type)
    resetCalc(r.amount > 0 ? String(r.amount) : '')
    setCatId(r.category_id ?? '')
    setAssetId(r.asset_id ?? '')
    setFromAssetId(r.from_asset_id ?? '')
    setToAssetId(r.to_asset_id ?? '')
    setFeeStr(r.fee > 0 ? r.fee.toLocaleString('ko-KR') : '')
    setContent(r.content ?? '')
    setNote(r.note ?? '')
  }

  // ── 계산기 키패드 핸들러 ──
  function onDigitPress(d: string) {
    setDigits(prev => {
      if (prev.length >= 9) return prev
      if (prev === '' && d === '0') return prev
      return prev + d
    })
  }

  function onOpPress(nextOp: Op) {
    if (digits === '') {
      // 입력 없이 연산자만 → 누산값이 있으면 대기 연산자만 교체
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

  function onEquals() {
    if (op === null || acc === null || digits === '') return
    const result = Math.max(0, Math.round(applyOp(acc, op, parseInt(digits, 10))))
    setAcc(null)
    setOp(null)
    setDigits(String(result))
  }

  function onBackspace() {
    if (digits !== '') {
      setDigits(prev => prev.slice(0, -1))
    } else if (op !== null) {
      setOp(null)
    }
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
        if (mode === 'new' && selectedRecurringId) {
          await fetch(`/api/recurring/${selectedRecurringId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_applied_month: displayMonthKeyForDate(date) }),
          })
          onRecurringApplied?.()
        }
        onSaved?.()
        if (continueAdding) {
          resetCalc('')
          setContent('')
          setNote('')
          setSelectedRecurringId('')
          setPanel('amount')
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

  async function confirmDelete() {
    if (!transactionId) return
    if (deleting) return
    setDeleting(true)
    setDeleteError('')

    try {
      const res = await fetch(`/api/transactions/${transactionId}`, { method: 'DELETE' })
      if (!res.ok) {
        setDeleteError('삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        setDeleting(false)
        return
      }
      setDeleteConfirmOpen(false)
      onSaved?.()
      onClose()
    } catch {
      setDeleteError('네트워크 오류가 발생했습니다.')
      setDeleting(false)
    }
  }

  const toneColor =
    type === 'income' ? 'var(--color-income)' :
    type === 'expense' ? 'var(--color-expense)' :
    'var(--color-primary)'

  if (!open) return null

  // 진행 중 수식 힌트 (예: "12,000 + 3,000")
  const exprHint = op !== null && acc !== null
    ? `${acc.toLocaleString('ko-KR')} ${OP_SYMBOL[op]}${digits ? ' ' + parseInt(digits, 10).toLocaleString('ko-KR') : ''}`
    : ''

  const recurringOptions = recurringList.filter(r => isSheetTxType(r.type))

  const selectedCat = currentCats.find(c => c.id === catId)
  const assetById = (id: string) => assets.find(a => a.id === id)
  const assetLabel = (a?: Asset) => a ? `${a.name}${!a.visible ? ' (숨김)' : ''}${isLoanPaidOff(a) ? ' · 완제' : ''}` : '선택'

  // 자산 선택 풀 (showFromTo는 from/to 별도 제약)
  const incomeExpensePool = withSelectedAssets(selectableAssets, assets, [assetId])
  const fromPool = withSelectedAssets(type === 'loan_repayment' ? repaymentFromAssets : selectableAssets, assets, [fromAssetId])
  const toPool = withSelectedAssets(type === 'loan_repayment'
    ? loanAssets.filter(a => a.id !== fromAssetId)
    : selectableAssets.filter(a => a.id !== fromAssetId), assets, [toAssetId])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[59] touch-none"
        style={{
          background: 'rgba(2,9,19,0.5)',
          animation: 'tds-fade-in 180ms ease-out both',
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[60] flex touch-pan-y flex-col rounded-t-[18px] bg-[var(--color-surface)]"
        style={{
          height: '92%',
          boxShadow: '0 -8px 28px rgba(0,0,0,0.18)',
          animation: 'sheet-slide-up 240ms cubic-bezier(0.2,0.7,0.3,1) both',
        }}
      >
        {/* Handle */}
        <div className="flex shrink-0 touch-none justify-center pb-1 pt-2.5">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border-strong)]" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 touch-none items-center justify-between px-4 py-2.5">
          <button
            onClick={onClose}
            className="text-[14px] text-[var(--color-text-sub)] min-w-[44px] text-left"
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
                onClick={() => {
                  setDeleteError('')
                  setDeleteConfirmOpen(true)
                }}
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
                    ? 'bg-[var(--color-surface)] shadow-seg text-[var(--color-text)]'
                    : 'text-[var(--color-text-sub)]'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Field list (scrollable) */}
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-2 pt-1">
          {mode === 'new' && recurringOptions.length > 0 && (
            <div className="mb-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Repeat size={14} className="text-[var(--color-primary)]" />
                <p className="text-[12px] font-medium text-[var(--color-text-sub)]">반복 거래</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recurringOptions.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => applyRecurringTemplate(r)}
                    className={`min-w-[148px] rounded-xl border px-3 py-2 text-left transition-colors ${
                      selectedRecurringId === r.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-sub)]'
                    }`}
                  >
                    <span className="block truncate text-[13px] font-semibold text-[var(--color-text)]">{r.content}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--color-text-sub)]">
                      매월 {r.day_of_month}일 · {formatAmount(r.amount)}원
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="divide-y divide-[var(--color-border)]">
            {/* 금액 */}
            <FieldRow label="금액" active={panel === 'amount'} onClick={() => setPanel('amount')}>
              <span className="tabular-nums font-semibold" style={{ color: amount > 0 ? toneColor : 'var(--color-text-sub)' }}>
                {formatAmount(amount)}원
              </span>
            </FieldRow>

            {/* 분류 (수입/지출) */}
            {showCategory && (
              <FieldRow label="분류" active={panel === 'category'} onClick={() => setPanel('category')}>
                {selectedCat ? (
                  <span className="flex items-center gap-1.5">
                    <CatIcon icon={selectedCat.icon || '📦'} id={selectedCat.id} size={20} />
                    <span className="font-medium text-[var(--color-text)]">{selectedCat.name}</span>
                  </span>
                ) : (
                  <span className="text-[var(--color-text-sub)]">선택</span>
                )}
              </FieldRow>
            )}

            {/* 자산 (수입/지출) */}
            {showCategory && (
              <FieldRow label="자산" active={panel === 'asset'} onClick={() => setPanel('asset')}>
                <span className={assetById(assetId) ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-sub)]'}>
                  {assetLabel(assetById(assetId))}
                </span>
              </FieldRow>
            )}

            {/* 출금/입금 (이체·대출상환) */}
            {showFromTo && (
              <>
                <FieldRow label="출금 계좌" active={panel === 'from'} onClick={() => setPanel('from')}>
                  <span className={assetById(fromAssetId) ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-sub)]'}>
                    {assetLabel(assetById(fromAssetId))}
                  </span>
                </FieldRow>
                <FieldRow
                  label={type === 'loan_repayment' ? '대출 계좌' : '입금 계좌'}
                  active={panel === 'to'}
                  onClick={() => setPanel('to')}
                >
                  <span className={assetById(toAssetId) ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-sub)]'}>
                    {assetLabel(assetById(toAssetId))}
                  </span>
                </FieldRow>
              </>
            )}

            {/* 이자 (대출상환) */}
            {type === 'loan_repayment' && (
              <div className="flex items-center gap-3 py-3">
                <span className="w-[68px] shrink-0 text-[13px] font-medium text-[var(--color-text-sub)]">이자 (선택)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={feeStr}
                  onChange={e => setFeeStr(fmtInput(e.target.value))}
                  onFocus={() => setPanel(null)}
                  placeholder="0"
                  className="tds-field !py-2 !text-[16px] text-right flex-1"
                />
              </div>
            )}

            {/* 날짜 */}
            <div className="flex items-center gap-3 py-3">
              <span className="w-[68px] shrink-0 text-[13px] font-medium text-[var(--color-text-sub)]">날짜</span>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                onFocus={() => setPanel(null)}
                className="tds-field flex-1 min-w-0 !py-2 !text-[16px]"
              />
              <button
                onClick={() => setDate(todayStr())}
                className="px-3 py-2 text-[13px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary-subtle)] rounded-xl shrink-0"
              >오늘</button>
            </div>

            {/* 내용 */}
            <div className="flex items-center gap-3 py-3">
              <span className="w-[68px] shrink-0 text-[13px] font-medium text-[var(--color-text-sub)]">내용</span>
              <input
                type="text"
                value={content}
                onChange={e => setContent(e.target.value)}
                onFocus={() => setPanel(null)}
                placeholder={
                  type === 'income' ? '예: 5월 급여' :
                  type === 'transfer' ? '예: 이체 메모' :
                  type === 'loan_repayment' ? '예: 대출 상환' :
                  '예: 점심 식사'
                }
                className="tds-field !py-2 !text-[16px] flex-1"
              />
            </div>

            {/* 메모 */}
            <div className="flex items-center gap-3 py-3">
              <span className="w-[68px] shrink-0 text-[13px] font-medium text-[var(--color-text-sub)]">메모</span>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                onFocus={() => setPanel(null)}
                placeholder="메모 (선택)"
                className="tds-field !py-2 !text-[16px] flex-1"
              />
            </div>
          </div>
        </div>

        {/* ── 하단 스왑 패널 ── */}
        {panel === 'amount' && (
          <div
            className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface-sub)]"
            style={{ padding: `8px 12px calc(8px + env(safe-area-inset-bottom, 0px))` }}
          >
            {/* 키패드 헤더: 평가 결과 + 수식 힌트 */}
            <div className="flex items-end justify-between px-1 pb-2">
              <span className="text-[12px] text-[var(--color-text-sub)] tabular-nums">{exprHint || (amount > 0 ? fmtKorean(amount) : '')}</span>
              <span className="tabular-nums font-bold leading-none" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, color: toneColor }}>
                {formatAmount(amount)}<span className="ml-0.5 text-[15px] font-semibold text-[var(--color-text-sub)]">원</span>
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {/* Row 1: 연산자 */}
              {(['/', '*', '-', '+'] as Op[]).map(o => (
                <KeyBtn key={o} onClick={() => onOpPress(o)} variant={op === o ? 'op-active' : 'op'}>{OP_SYMBOL[o]}</KeyBtn>
              ))}
              {/* Row 2 */}
              {['7', '8', '9'].map(d => <KeyBtn key={d} onClick={() => onDigitPress(d)}>{d}</KeyBtn>)}
              <KeyBtn onClick={onBackspace} variant="util">⌫</KeyBtn>
              {/* Row 3 */}
              {['4', '5', '6'].map(d => <KeyBtn key={d} onClick={() => onDigitPress(d)}>{d}</KeyBtn>)}
              <KeyBtn onClick={() => resetCalc('')} variant="util">C</KeyBtn>
              {/* Row 4 */}
              {['1', '2', '3'].map(d => <KeyBtn key={d} onClick={() => onDigitPress(d)}>{d}</KeyBtn>)}
              <KeyBtn onClick={onEquals} variant="op">=</KeyBtn>
              {/* Row 5 */}
              <KeyBtn onClick={() => onDigitPress('0')} span2>0</KeyBtn>
              <button
                onClick={() => (op !== null ? onEquals() : submit(false))}
                disabled={!isValid || saving}
                className="h-12 rounded-xl text-white text-[15px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50 active:opacity-80 transition-opacity"
                style={{ gridColumn: 'span 2', background: toneColor }}
              >
                {op !== null ? '=' : (saving ? '저장 중…' : '저장')}
              </button>
            </div>
          </div>
        )}

        {panel === 'category' && (
          <SwapPanel title="분류 선택">
            {currentCats.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[var(--color-text-sub)]">등록된 분류가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {currentCats.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCatId(c.id)
                      if (c.default_asset_id) {
                        setAssetId(c.default_asset_id)
                        setPanel('amount')
                      } else {
                        setPanel('asset')
                      }
                    }}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-colors ${
                      catId === c.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                    }`}
                  >
                    <CatIcon icon={c.icon || '📦'} id={c.id} size={26} />
                    <span className={`text-[12px] font-medium ${catId === c.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-body)]'}`}>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </SwapPanel>
        )}

        {panel === 'asset' && (
          <SwapPanel title="자산 선택">
            <AssetGroupPicker pool={incomeExpensePool} selectedId={assetId} onSelect={id => { setAssetId(id); setPanel('amount') }} />
          </SwapPanel>
        )}

        {panel === 'from' && (
          <SwapPanel title="출금 계좌 선택">
            <AssetGroupPicker pool={fromPool} selectedId={fromAssetId} onSelect={id => { setFromAssetId(id); setPanel('to') }} />
          </SwapPanel>
        )}

        {panel === 'to' && (
          <SwapPanel title={type === 'loan_repayment' ? '대출 계좌 선택' : '입금 계좌 선택'}>
            <AssetGroupPicker pool={toPool} selectedId={toAssetId} onSelect={id => { setToAssetId(id); setPanel('amount') }} />
          </SwapPanel>
        )}

        {panel === null && (
          <div
            className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
            style={{ padding: `8px 16px calc(8px + env(safe-area-inset-bottom, 0px))` }}
          >
            <button
              onClick={() => submit(false)}
              disabled={!isValid || saving}
              className="w-full h-12 rounded-xl text-white text-[15px] font-semibold disabled:opacity-40 active:opacity-80 transition-opacity"
              style={{ background: toneColor }}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="거래를 삭제할까요?"
        description={(
          <>
            <span className="block font-medium text-[var(--color-text)]">{content || '(내용 없음)'}</span>
            <span className="mt-1 block">{date} · {formatAmount(amount)}원 거래가 삭제됩니다.</span>
            {deleteError && <span className="mt-2 block font-medium text-[var(--color-expense)]">{deleteError}</span>}
          </>
        )}
        confirmLabel="삭제"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteConfirmOpen(false)}
      />
    </>
  )
}

// ── 필드 리스트 행 ──
function FieldRow({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3 text-left"
    >
      <span className="w-[68px] shrink-0 text-[13px] font-medium text-[var(--color-text-sub)]">{label}</span>
      <span className={`flex-1 min-w-0 truncate text-[15px] ${active ? '' : ''}`}>{children}</span>
      <ChevronRight size={16} className={active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-sub)]'} />
    </button>
  )
}

// ── 키패드 버튼 ──
function KeyBtn({ onClick, children, variant = 'digit', span2 }: { onClick: () => void; children: ReactNode; variant?: 'digit' | 'op' | 'op-active' | 'util'; span2?: boolean }) {
  const base = 'h-12 rounded-xl border text-[18px] font-semibold active:opacity-70 transition-colors flex items-center justify-center'
  const styles: Record<string, string> = {
    digit: 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]',
    op: 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-primary)]',
    'op-active': 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white',
    util: 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-sub)]',
  }
  return (
    <button onClick={onClick} className={`${base} ${styles[variant]}`} style={span2 ? { gridColumn: 'span 2' } : undefined}>
      {children}
    </button>
  )
}

// ── 분류/자산 스왑 패널 컨테이너 ──
function SwapPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface-sub)]"
      style={{ padding: `10px 12px calc(10px + env(safe-area-inset-bottom, 0px))` }}
    >
      <p className="px-1 pb-2 text-[12px] font-medium text-[var(--color-text-sub)]">{title}</p>
      <div className="max-h-[42vh] overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  )
}

