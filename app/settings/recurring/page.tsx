'use client'

import { useState, useEffect } from 'react'
import { Plus, MoreHorizontal, Repeat } from 'lucide-react'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import { useStore } from '@/lib/store'
import { isDebtAssetType, validateTransactionInput } from '@/lib/finance'
import { formatAmount } from '@/lib/utils'
import type { RecurringTransaction, TransactionType } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  income: '수입',
  expense: '지출',
  transfer: '이체',
  loan_repayment: '대출상환',
}

const TYPE_COLORS: Record<string, string> = {
  income: 'text-[var(--color-income)]',
  expense: 'text-[var(--color-expense)]',
  transfer: 'text-[var(--color-text-sub)]',
  loan_repayment: 'text-[var(--color-expense)]',
}

const TYPE_SIGN: Record<string, string> = {
  income: '+',
  expense: '-',
  transfer: '',
  loan_repayment: '-',
}

function fmtInput(s: string): string {
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('ko-KR')
}

function parseAmount(s: string): number {
  return Number(s.replace(/,/g, '')) || 0
}

function withSelectedCategories<T extends { id: string }>(base: T[], all: T[], selectedIds: string[]): T[] {
  const map = new Map(base.map(category => [category.id, category]))
  for (const id of selectedIds.filter(Boolean)) {
    const selected = all.find(category => category.id === id)
    if (selected && !map.has(id)) map.set(id, selected)
  }
  return Array.from(map.values())
}

interface FormState {
  type: TransactionType
  amountStr: string
  feeStr: string
  category_id: string
  asset_id: string
  from_asset_id: string
  to_asset_id: string
  content: string
  note: string
  day_of_month: number
}

const defaultForm = (): FormState => ({
  type: 'expense',
  amountStr: '',
  feeStr: '',
  category_id: '',
  asset_id: '',
  from_asset_id: '',
  to_asset_id: '',
  content: '',
  note: '',
  day_of_month: 1,
})

export default function RecurringPage() {
  const { assets, categories } = useStore()
  const [list, setList] = useState<RecurringTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringTransaction | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm())
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringTransaction | null>(null)

  useEffect(() => {
    fetch('/api/recurring')
      .then(r => r.json())
      .then((data: RecurringTransaction[]) => setList(data))
      .finally(() => setLoading(false))
  }, [])

  function openAdd() {
    setEditing(null)
    setForm(defaultForm())
    setSheetOpen(true)
  }

  function openEdit(r: RecurringTransaction) {
    setEditing(r)
    setForm({
      type: r.type,
      amountStr: r.amount > 0 ? r.amount.toLocaleString('ko-KR') : '',
      feeStr: r.fee > 0 ? r.fee.toLocaleString('ko-KR') : '',
      category_id: r.category_id,
      asset_id: r.asset_id,
      from_asset_id: r.from_asset_id,
      to_asset_id: r.to_asset_id,
      content: r.content,
      note: r.note,
      day_of_month: r.day_of_month,
    })
    setMenuOpen(null)
    setSheetOpen(true)
  }

  async function toggleEnabled(r: RecurringTransaction) {
    const res = await fetch(`/api/recurring/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !r.enabled }),
    })
    if (res.ok) {
      const updated: RecurringTransaction = await res.json()
      setList(prev => prev.map(x => x.id === updated.id ? updated : x))
    }
    setMenuOpen(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const res = await fetch(`/api/recurring/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) setList(prev => prev.filter(x => x.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  async function handleSave() {
    const amount = parseAmount(form.amountStr)
    const fee = parseAmount(form.feeStr)
    if (amount <= 0) return
    if (!form.content.trim()) return

    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`/api/recurring/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, amount, fee }),
        })
        if (res.ok) {
          const updated: RecurringTransaction = await res.json()
          setList(prev => prev.map(x => x.id === updated.id ? updated : x))
        }
      } else {
        const res = await fetch('/api/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, amount, fee }),
        })
        if (res.ok) {
          const created: RecurringTransaction = await res.json()
          setList(prev => [...prev, created])
        }
      }
      setSheetOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const needsAsset = form.type === 'income' || form.type === 'expense'
  const needsFromTo = form.type === 'transfer' || form.type === 'loan_repayment'
  const visibleCategories = withSelectedCategories(
    categories.filter(c => c.type === (form.type === 'income' ? 'income' : 'expense') && c.visible),
    categories,
    [form.category_id]
  )
  const selectableAssets = assets
  const loanAssets = selectableAssets.filter(a => a.group_type === 'loan')
  const repaymentFromAssets = selectableAssets.filter(a => !isDebtAssetType(a.group_type))
  const fromAssets = form.type === 'loan_repayment' ? repaymentFromAssets : selectableAssets
  const toAssets = form.type === 'loan_repayment'
    ? loanAssets.filter(a => a.id !== form.from_asset_id)
    : selectableAssets.filter(a => a.id !== form.from_asset_id)

  const validationError = validateTransactionInput({
    type: form.type,
    amount: parseAmount(form.amountStr),
    category_id: needsAsset ? form.category_id : '',
    asset_id: needsAsset ? form.asset_id : '',
    from_asset_id: needsFromTo ? form.from_asset_id : '',
    to_asset_id: needsFromTo ? form.to_asset_id : '',
    fee: form.type === 'loan_repayment' ? parseAmount(form.feeStr) : 0,
  }, assets, categories, needsAsset ? [form.category_id] : [])
  const isValid = form.content.trim() !== '' && validationError === null

  return (
    <>
      <div className="flex flex-col min-h-full">
        <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <h1 className="text-[17px] font-bold text-[var(--color-text)]">반복 거래</h1>
          <button
            onClick={openAdd}
            className="flex h-11 items-center gap-1 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
          >
            <Plus size={16} />
            추가
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
              <p className="text-sm">불러오는 중…</p>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-sub)]">
              <Repeat size={32} className="mb-3 opacity-30" />
              <p className="text-sm mb-1">반복 거래가 없습니다</p>
              <p className="text-xs">매월 자동 적용할 거래를 등록해보세요</p>
            </div>
          ) : (
            <div className="bg-[var(--color-surface-sub)] rounded-2xl overflow-hidden">
              {list.map((r, i) => (
                <div
                  key={r.id}
                  className={`relative flex items-center px-4 py-3.5 hover:bg-[var(--color-surface)] transition-colors ${i < list.length - 1 ? 'border-b border-[var(--color-border)]' : ''} ${!r.enabled ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text-sub)]">
                        {TYPE_LABELS[r.type]}
                      </span>
                      <span className="text-[14px] font-medium text-[var(--color-text)] truncate">{r.content}</span>
                    </div>
                    <p className="text-[12px] text-[var(--color-text-sub)]">
                      매월 {r.day_of_month}일{r.type === 'loan_repayment' && r.fee > 0 ? ` · 이자 ${formatAmount(r.fee)}원` : ''}
                    </p>
                  </div>
                  <span className={`text-[15px] font-semibold mr-2 tabular-nums ${TYPE_COLORS[r.type]}`}>
                    {TYPE_SIGN[r.type]}{formatAmount(r.amount)}원
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === r.id ? null : r.id) }}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-[var(--color-border)] transition-colors"
                    aria-label="반복 거래 메뉴"
                  >
                    <MoreHorizontal size={16} className="text-[var(--color-text-sub)]" />
                  </button>

                  {menuOpen === r.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                      <div className="absolute right-2 top-10 z-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-e3 overflow-hidden min-w-[120px]">
                        <button
                          onClick={() => openEdit(r)}
                          className="w-full px-4 py-2.5 text-sm text-left text-[var(--color-text)] hover:bg-[var(--color-surface-sub)] transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => toggleEnabled(r)}
                          className="w-full px-4 py-2.5 text-sm text-left text-[var(--color-text)] hover:bg-[var(--color-surface-sub)] transition-colors"
                        >
                          {r.enabled ? '비활성화' : '활성화'}
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(r); setMenuOpen(null) }}
                          className="w-full px-4 py-2.5 text-sm text-left text-[var(--color-expense)] hover:bg-[var(--color-surface-sub)] transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 추가/수정 폼 시트 */}
      <SlideUpSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? '반복 거래 수정' : '반복 거래 추가'}>
        <div className="flex flex-col gap-4 pb-safe">
          {/* 거래 타입 */}
          <div className="grid grid-cols-4 gap-1">
            {(['expense', 'income', 'transfer', 'loan_repayment'] as TransactionType[]).map(t => (
              <button
                key={t}
                onClick={() => setForm(f => ({ ...f, type: t, category_id: '', asset_id: '', from_asset_id: '', to_asset_id: '', feeStr: '' }))}
                className={`py-2 rounded-xl text-[13px] font-medium transition-colors ${form.type === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface-sub)] text-[var(--color-text-sub)]'}`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* 금액 */}
          <div>
            <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">금액</p>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={form.amountStr}
                onChange={e => setForm(f => ({ ...f, amountStr: fmtInput(e.target.value) }))}
                placeholder="0"
                className="tds-field text-right !text-[18px] font-bold"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-sub)] text-sm">원</span>
            </div>
          </div>

          {/* 내용 */}
          <div>
            <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">내용</p>
            <input
              type="text"
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="반복 거래 내용"
              className="tds-field"
            />
          </div>

          {/* 매월 몇 일 */}
          <div>
            <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">적용일 (매월)</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.day_of_month}
                onChange={e => {
                  const day = Number(e.target.value.replace(/\D/g, ''))
                  setForm(f => ({ ...f, day_of_month: Math.min(31, Math.max(1, day || 1)) }))
                }}
                className="tds-field w-24 text-center !text-[16px]"
              />
              <span className="text-[15px] text-[var(--color-text-sub)]">일</span>
            </div>
          </div>

          {/* 자산 (income/expense) */}
          {needsAsset && (
            <div>
              <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">자산</p>
              <select
                value={form.asset_id}
                onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))}
                className="tds-field"
              >
                <option value="">자산 선택</option>
                {selectableAssets.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* from/to 자산 (transfer/loan_repayment) */}
          {needsFromTo && (
            <>
              <div>
                <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">출금 자산</p>
                <select
                  value={form.from_asset_id}
                  onChange={e => setForm(f => ({ ...f, from_asset_id: e.target.value }))}
                  className="tds-field"
                >
                  <option value="">자산 선택</option>
                  {fromAssets.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">{form.type === 'loan_repayment' ? '대출 계좌' : '입금 자산'}</p>
                <select
                  value={form.to_asset_id}
                  onChange={e => setForm(f => ({ ...f, to_asset_id: e.target.value }))}
                  className="tds-field"
                >
                  <option value="">자산 선택</option>
                  {toAssets.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {form.type === 'loan_repayment' && (
                <div>
                  <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">이자 금액 (선택)</p>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.feeStr}
                      onChange={e => setForm(f => ({ ...f, feeStr: fmtInput(e.target.value) }))}
                      placeholder="0"
                      className="tds-field text-right !text-[16px]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-sub)] text-sm">원</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 분류 (income/expense) */}
          {needsAsset && visibleCategories.length > 0 && (
            <div>
              <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">분류</p>
              <select
                value={form.category_id}
                onChange={e => {
                  const cat = categories.find(c => c.id === e.target.value)
                  setForm(f => ({ ...f, category_id: e.target.value, asset_id: cat?.default_asset_id || f.asset_id }))
                }}
                className="tds-field"
              >
                <option value="">분류 선택</option>
                {visibleCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 메모 */}
          <div>
            <p className="text-[12px] text-[var(--color-text-sub)] mb-1.5">메모 (선택)</p>
            <input
              type="text"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder=""
              className="tds-field"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="w-full h-14 rounded-2xl bg-[var(--color-primary)] text-white text-[16px] font-semibold disabled:opacity-40 transition-opacity"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </SlideUpSheet>

      {/* 삭제 확인 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--color-surface)] rounded-2xl p-6 mx-4 max-w-sm w-full shadow-[0px_8px_24px_rgba(0,0,0,0.16)]">
            <p className="text-[16px] font-semibold text-[var(--color-text)] mb-2">반복 거래를 삭제할까요?</p>
            <p className="text-sm text-[var(--color-text-sub)] mb-6">
              &ldquo;{deleteTarget.content}&rdquo; 템플릿이 삭제됩니다.
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 h-12 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] text-[15px] font-medium"
                onClick={() => setDeleteTarget(null)}
              >
                취소
              </button>
              <button
                className="flex-1 h-12 rounded-xl bg-[var(--color-expense)] text-white text-[15px] font-semibold"
                onClick={confirmDelete}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
