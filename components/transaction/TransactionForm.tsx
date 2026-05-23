'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { isDebtAssetType, validateTransactionInput } from '@/lib/finance'
import { useStore } from '@/lib/store'
import CatIcon from '@/components/ui/CatIcon'
import { todayStr } from '@/lib/utils'
import type { Transaction } from '@/lib/types'

type TxType = 'expense' | 'income' | 'transfer' | 'loan_repayment'

interface FormState {
  type: TxType
  amount: string
  date: string
  assetId: string
  fromAssetId: string
  toAssetId: string
  fee: string
  categoryId: string
  content: string
  note: string
}

interface Props {
  mode: 'new' | 'edit'
  initial?: Partial<Transaction>
  transactionId?: string
}

const TYPE_LABELS: Record<TxType, string> = {
  expense: '지출',
  income: '수입',
  transfer: '이체',
  loan_repayment: '대출상환',
}

const TYPES: TxType[] = ['income', 'expense', 'transfer', 'loan_repayment']

function fmtNum(n: number): string {
  return n > 0 ? n.toLocaleString('ko-KR') : ''
}

function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0
}

function fmtInput(s: string): string {
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('ko-KR')
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

function txToForm(tx: Partial<Transaction>): FormState {
  const rawType = tx.type
  const type: TxType =
    rawType === 'income' || rawType === 'transfer' || rawType === 'loan_repayment'
      ? rawType
      : 'expense'
  return {
    type,
    amount: fmtNum(tx.amount ?? 0),
    date: tx.date ?? todayStr(),
    assetId: tx.asset_id ?? '',
    fromAssetId: tx.from_asset_id ?? '',
    toAssetId: tx.to_asset_id ?? '',
    fee: fmtNum(tx.fee ?? 0),
    categoryId: tx.category_id ?? '',
    content: tx.content ?? '',
    note: tx.note ?? '',
  }
}

const DEFAULT_FORM: FormState = {
  type: 'expense',
  amount: '',
  date: todayStr(),
  assetId: '',
  fromAssetId: '',
  toAssetId: '',
  fee: '',
  categoryId: '',
  content: '',
  note: '',
}

export default function TransactionForm({ mode, initial, transactionId }: Props) {
  const router = useRouter()
  const { categories, assets } = useStore()

  const [form, setForm] = useState<FormState>(initial ? txToForm(initial) : DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/transactions/suggestions')
      .then(r => r.json())
      .then(data => setSuggestions(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const filteredSuggestions = form.content.trim()
    ? suggestions.filter(s => s.toLowerCase().includes(form.content.toLowerCase()) && s !== form.content)
    : []

  const visibleAssets = assets.filter(a => a.visible)
  const visibleLoanAssets = visibleAssets.filter(a => a.group_type === 'loan')
  const repaymentFromAssets = visibleAssets.filter(a => !isDebtAssetType(a.group_type))
  const singleAssetOptions = withSelectedAssets(visibleAssets, assets, [form.assetId])
  const currentCategories = withSelectedCategories(
    categories.filter(c => c.type === form.type && c.visible),
    categories,
    [form.categoryId]
  )
  const showSingleAsset = form.type === 'income' || form.type === 'expense'
  const showFromTo = form.type === 'transfer' || form.type === 'loan_repayment'
  const showFee = form.type === 'transfer' || form.type === 'loan_repayment'
  const showCategory = form.type === 'income' || form.type === 'expense'

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleTypeChange(type: TxType) {
    setForm(f => ({ ...f, type, categoryId: '' }))
    setError('')
  }

  function validate(): string {
    return validateTransactionInput({
      type: form.type,
      amount: parseNum(form.amount),
      category_id: form.categoryId,
      asset_id: form.assetId,
      from_asset_id: form.fromAssetId,
      to_asset_id: form.toAssetId,
      fee: parseNum(form.fee),
    }, assets, categories, form.type === 'income' || form.type === 'expense' ? [form.categoryId] : []) ?? ''
  }

  async function submit(continueAfter: boolean) {
    const errMsg = validate()
    if (errMsg) { setError(errMsg); return }

    setSaving(true)
    setError('')

    const payload = {
      type: form.type,
      amount: parseNum(form.amount),
      date: form.date,
      category_id: form.categoryId,
      asset_id: form.assetId,
      content: form.content,
      note: form.note,
      from_asset_id: form.fromAssetId,
      to_asset_id: form.toAssetId,
      fee: parseNum(form.fee),
    }

    try {
      const res = mode === 'edit' && transactionId
        ? await fetch(`/api/transactions/${transactionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '저장 중 오류가 발생했습니다')
        return
      }

      if (continueAfter) {
        setForm(f => ({ ...f, amount: '', content: '', note: '', fee: '' }))
      } else {
        router.back()
      }
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!transactionId) return
    if (!confirm('거래를 삭제하시겠습니까?')) return
    const res = await fetch(`/api/transactions/${transactionId}`, { method: 'DELETE' })
    if (res.ok) router.back()
  }

  const fromAssets = withSelectedAssets(
    form.type === 'loan_repayment' ? repaymentFromAssets : visibleAssets,
    assets,
    [form.fromAssetId]
  )
  const toAssets = withSelectedAssets(
    form.type === 'loan_repayment'
    ? visibleLoanAssets.filter(a => a.id !== form.fromAssetId)
    : visibleAssets.filter(a => a.id !== form.fromAssetId),
    assets,
    [form.toAssetId]
  )

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)] transition-colors"
          >
            <ChevronLeft size={20} className="text-[var(--color-text)]" />
          </button>
          <h1 className="text-[17px] font-bold text-[var(--color-text)]">
            {mode === 'new' ? '내역 추가' : '거래 수정'}
          </h1>
          {mode === 'edit' ? (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)] transition-colors"
            >
              <Trash2 size={18} className="text-[var(--color-expense)]" />
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>

        {/* 거래 타입 탭 */}
        <div className="flex border-t border-[var(--color-border)]">
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                form.type === t
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-sub)] hover:text-[var(--color-text)]'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* 폼 본문 */}
      <div className="flex-1 px-4 py-5 space-y-5 pb-32">

        {/* 금액 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">금액</label>
          <div className="flex items-center gap-2 rounded-xl px-4 focus-within:outline focus-within:outline-[var(--color-primary)] transition-colors" style={{ background: 'rgba(0,23,51,0.02)', border: '1px solid rgba(2,32,71,0.05)' }}>
            <input
              type="text"
              inputMode="numeric"
              value={form.amount}
              onChange={e => set('amount', fmtInput(e.target.value))}
              placeholder="0"
              className="flex-1 text-right text-[28px] font-bold text-[var(--color-text)] bg-transparent py-4 outline-none placeholder:text-[var(--color-text-placeholder)]"
            />
            <span className="text-lg font-bold text-[var(--color-text-sub)] shrink-0">원</span>
          </div>
        </div>

        {/* 날짜 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">날짜</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="tds-field flex-1 min-w-0 !w-auto"
            />
            <button
              type="button"
              onClick={() => set('date', todayStr())}
              className="px-3 py-2.5 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary-subtle)] rounded-xl shrink-0"
            >
              오늘
            </button>
          </div>
        </div>

        {/* 자산 (수입/지출) */}
        {showSingleAsset && (
          <div>
            <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">자산</label>
            <select
              value={form.assetId}
              onChange={e => set('assetId', e.target.value)}
              className="tds-field"
            >
              <option value="">자산 선택</option>
              {singleAssetOptions.map(a => (
                <option key={a.id} value={a.id}>{a.name}{!a.visible ? ' (숨김)' : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* 출금/입금 계좌 (이체/대출상환) */}
        {showFromTo && (
          <>
            <div>
              <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">출금 계좌</label>
              <select
                value={form.fromAssetId}
                onChange={e => set('fromAssetId', e.target.value)}
                className="tds-field"
              >
                <option value="">계좌 선택</option>
                {fromAssets.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{!a.visible ? ' (숨김)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">
                {form.type === 'loan_repayment' ? '대출 계좌' : '입금 계좌'}
              </label>
              <select
                value={form.toAssetId}
                onChange={e => set('toAssetId', e.target.value)}
                className="tds-field"
              >
                <option value="">계좌 선택</option>
                {toAssets.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{!a.visible ? ' (숨김)' : ''}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* 수수료/이자 */}
        {showFee && (
          <div>
            <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">
              {form.type === 'loan_repayment' ? '이자 금액 (선택)' : '수수료 (선택)'}
            </label>
            <div className="flex items-center gap-2 rounded-xl px-3 focus-within:outline focus-within:outline-[var(--color-primary)] transition-colors" style={{ background: 'rgba(0,23,51,0.02)', border: '1px solid rgba(2,32,71,0.05)' }}>
              <input
                type="text"
                inputMode="numeric"
                value={form.fee}
                onChange={e => set('fee', fmtInput(e.target.value))}
                placeholder="0"
                className="flex-1 text-right text-[16px] text-[var(--color-text)] bg-transparent py-2.5 outline-none placeholder:text-[var(--color-text-placeholder)]"
              />
              <span className="text-sm text-[var(--color-text-sub)] shrink-0">원</span>
            </div>
          </div>
        )}

        {/* 분류 (수입/지출) */}
        {showCategory && (
          <div>
            <label className="text-xs font-medium text-[var(--color-text-sub)] mb-2 block">분류</label>
            {currentCategories.length === 0 ? (
              <p className="text-sm text-[var(--color-text-sub)] py-2">
                카테고리가 없습니다. 설정에서 추가해 주세요.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {currentCategories.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set('categoryId', c.id)}
                    className={`flex flex-col items-center gap-1 px-1 py-3 rounded-xl text-xs transition-colors border ${
                      form.categoryId === c.id
                        ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'bg-[var(--color-surface-sub)] text-[var(--color-text-body)] border-transparent hover:border-[var(--color-border-strong)]'
                    }`}
                  >
                    <CatIcon icon={c.icon || '📦'} id={c.id} size={28} />
                    <span className="truncate w-full text-center leading-tight">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 내용 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">내용</label>
          <div ref={contentRef} className="relative">
            <input
              type="text"
              value={form.content}
              onChange={e => { set('content', e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="내용을 입력하세요"
              className="tds-field"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0px_4px_12px_rgba(0,0,0,0.12)] overflow-hidden">
                {filteredSuggestions.slice(0, 6).map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={() => { set('content', s); setShowSuggestions(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-sub)] transition-colors border-b border-[var(--color-border)] last:border-0"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 메모 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">메모 (선택)</label>
          <input
            type="text"
            value={form.note}
            onChange={e => set('note', e.target.value)}
            placeholder="메모를 입력하세요"
            className="tds-field"
          />
        </div>

        {/* 에러 */}
        {error && (
          <p className="text-sm text-[var(--color-expense)] font-medium">{error}</p>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-4 py-3 flex gap-2 md:static md:mt-auto" style={{ paddingBottom: 'calc(12px + var(--safe-area-bottom))' }}>
        {mode === 'new' && (
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={saving}
            className="flex-1 h-14 rounded-xl border border-[var(--color-border)] text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-sub)] transition-colors disabled:opacity-50"
          >
            저장 후 계속
          </button>
        )}
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={saving}
          className={`${mode === 'new' ? 'flex-1' : 'w-full'} h-14 rounded-xl bg-[var(--color-primary)] text-white text-[15px] font-semibold hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50`}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}
