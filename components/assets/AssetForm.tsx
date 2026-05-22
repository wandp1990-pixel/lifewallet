'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import { useStore } from '@/lib/store'
import { formatAmount } from '@/lib/utils'
import type { Asset, AssetGroupType } from '@/lib/types'

const GROUP_TYPES: { value: AssetGroupType; label: string }[] = [
  { value: 'cash', label: '현금' },
  { value: 'bank', label: '은행' },
  { value: 'card', label: '카드' },
  { value: 'check_card', label: '체크카드' },
  { value: 'prepaid_card', label: '선불카드' },
  { value: 'savings', label: '저축' },
  { value: 'investment', label: '투자' },
  { value: 'minus_account', label: '마이너스통장' },
  { value: 'loan', label: '대출' },
  { value: 'insurance', label: '보험' },
  { value: 'other', label: '기타' },
]

const DEBT_TYPES: AssetGroupType[] = ['card', 'minus_account', 'loan', 'insurance']

function fmtInput(s: string): string {
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('ko-KR')
}

function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0
}

interface FormState {
  name: string
  group_type: AssetGroupType
  group_name: string
  balance: string
  visible: boolean
  track_detail: boolean
  principal: string
  interest_rate: string
  start_date: string
  end_date: string
  payment_day: string
  monthly_payment: string
}

function assetToForm(asset: Asset): FormState {
  return {
    name: asset.name,
    group_type: asset.group_type,
    group_name: asset.group_name,
    balance: asset.balance !== 0 ? formatAmount(asset.balance) : '',
    visible: asset.visible,
    track_detail: asset.track_detail,
    principal: asset.principal ? formatAmount(asset.principal) : '',
    interest_rate: asset.interest_rate ? String(asset.interest_rate) : '',
    start_date: asset.start_date ?? '',
    end_date: asset.end_date ?? '',
    payment_day: asset.payment_day ? String(asset.payment_day) : '',
    monthly_payment: asset.monthly_payment ? formatAmount(asset.monthly_payment) : '',
  }
}

const DEFAULT_FORM: FormState = {
  name: '',
  group_type: 'bank',
  group_name: '',
  balance: '',
  visible: true,
  track_detail: false,
  principal: '',
  interest_rate: '',
  start_date: '',
  end_date: '',
  payment_day: '',
  monthly_payment: '',
}

interface Props {
  open: boolean
  onClose: () => void
  editing: Asset | null
}

export default function AssetForm({ open, onClose, editing }: Props) {
  const { addAsset, updateAsset, deleteAsset } = useStore()
  const [form, setForm] = useState<FormState>(editing ? assetToForm(editing) : DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // form reset when sheet opens
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setForm(editing ? assetToForm(editing) : DEFAULT_FORM)
      setError('')
    }
  }

  const isLoan = form.group_type === 'loan'
  const forceTrackDetail = form.group_type === 'loan' || form.group_type === 'savings'

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('자산 이름을 입력해주세요'); return }

    setSaving(true)
    setError('')

    const payload = {
      name: form.name.trim(),
      group_type: form.group_type,
      group_name: form.group_name.trim(),
      balance: parseNum(form.balance),
      visible: form.visible,
      track_detail: forceTrackDetail || form.track_detail,
      ...(isLoan && {
        principal: parseNum(form.principal),
        interest_rate: parseFloat(form.interest_rate) || 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        payment_day: parseInt(form.payment_day) || 0,
        monthly_payment: parseNum(form.monthly_payment),
      }),
    }

    try {
      if (editing) {
        const prevBalance = editing.balance
        const res = await fetch(`/api/assets/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? '저장 실패'); return }
        const updated: Asset = await res.json()
        updateAsset(updated)

        // 잔액이 변경됐으면 asset 타입 거래 자동 생성
        if (updated.balance !== prevBalance) {
          await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'asset',
              amount: updated.balance - prevBalance,
              date: new Date().toISOString().slice(0, 10),
              asset_id: editing.id,
              content: '잔액 조정',
              category_id: '',
              from_asset_id: '',
              to_asset_id: '',
              note: '',
              fee: 0,
            }),
          })
        }
      } else {
        const res = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? '저장 실패'); return }
        const created: Asset = await res.json()
        addAsset(created)
      }
      onClose()
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editing) return
    if (!confirm(`'${editing.name}' 자산을 삭제하시겠습니까?\n연결된 거래가 있으면 해당 자산 정보가 제거됩니다.`)) return
    const res = await fetch(`/api/assets/${editing.id}`, { method: 'DELETE' })
    if (res.ok) {
      deleteAsset(editing.id)
      onClose()
    }
  }

  const deleteBtn = editing ? (
    <button
      type="button"
      onClick={handleDelete}
      className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)] transition-colors"
      aria-label="삭제"
    >
      <Trash2 size={18} className="text-[var(--color-expense)]" />
    </button>
  ) : undefined

  return (
    <SlideUpSheet
      open={open}
      onClose={onClose}
      title={editing ? '자산 수정' : '자산 추가'}
      rightAction={deleteBtn}
    >
      <div className="space-y-4 pb-4">
        {/* 자산 이름 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">자산 이름</label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="예: 국민은행 통장"
            className="tds-field"
          />
        </div>

        {/* 그룹 유형 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">그룹 유형</label>
          <select
            value={form.group_type}
            onChange={e => set('group_type', e.target.value as AssetGroupType)}
            className="tds-field"
          >
            {GROUP_TYPES.map(g => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>

        {/* 그룹 이름 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">그룹 이름 (선택)</label>
          <input
            type="text"
            value={form.group_name}
            onChange={e => set('group_name', e.target.value)}
            placeholder="예: 국민은행"
            className="tds-field"
          />
        </div>

        {/* 잔액 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">
            {DEBT_TYPES.includes(form.group_type) ? '부채 금액' : '잔액'}
          </label>
          <div className="flex items-center gap-2 rounded-xl px-4 overflow-hidden" style={{ background: "rgba(0,23,51,0.02)", border: "1px solid rgba(2,32,71,0.05)" }}>
            <input
              type="text"
              inputMode="numeric"
              value={form.balance}
              onChange={e => set('balance', fmtInput(e.target.value))}
              placeholder="0"
              className="flex-1 min-w-0 text-right text-[22px] font-bold text-[var(--color-text)] bg-transparent py-3 outline-none placeholder:text-[var(--color-text-placeholder)]"
            />
            <span className="text-base font-bold text-[var(--color-text-sub)] shrink-0">원</span>
          </div>
        </div>

        {/* 대출 추가 필드 */}
        {isLoan && (
          <>
            <div className="h-px bg-[var(--color-border)]" />
            <p className="text-xs font-semibold text-[var(--color-text-sub)] uppercase tracking-wide">대출 정보</p>

            <div>
              <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">원금</label>
              <div className="flex items-center gap-2 rounded-xl px-3 overflow-hidden" style={{ background: "rgba(0,23,51,0.02)", border: "1px solid rgba(2,32,71,0.05)" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.principal}
                  onChange={e => set('principal', fmtInput(e.target.value))}
                  placeholder="0"
                  className="flex-1 min-w-0 text-right text-[16px] text-[var(--color-text)] bg-transparent py-2.5 outline-none"
                />
                <span className="text-sm text-[var(--color-text-sub)] shrink-0">원</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">이자율 (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.interest_rate}
                onChange={e => set('interest_rate', e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="3.5"
                className="tds-field"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">시작일</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => set('start_date', e.target.value)}
                  className="tds-field !py-2.5 !text-[14px] !px-3"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">만기일 (선택)</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => set('end_date', e.target.value)}
                  className="tds-field !py-2.5 !text-[14px] !px-3"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">상환일 (매월 N일)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.payment_day}
                  onChange={e => set('payment_day', e.target.value.replace(/\D/g, ''))}
                  placeholder="25"
                  className="tds-field !py-2.5 !text-[14px] !px-3"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">월 상환액</label>
                <div className="flex items-center gap-1 rounded-xl px-3 overflow-hidden" style={{ background: "rgba(0,23,51,0.02)", border: "1px solid rgba(2,32,71,0.05)" }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.monthly_payment}
                    onChange={e => set('monthly_payment', fmtInput(e.target.value))}
                    placeholder="0"
                    className="flex-1 min-w-0 text-right text-[16px] text-[var(--color-text)] bg-transparent py-2.5 outline-none"
                  />
                  <span className="text-xs text-[var(--color-text-sub)] shrink-0">원</span>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="h-px bg-[var(--color-border)]" />

        {/* 숨기기 토글 */}
        <div className="flex items-center justify-between py-0.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">숨기기</p>
            <p className="text-xs text-[var(--color-text-sub)]">가계부·대시보드 집계에서 제외</p>
          </div>
          <button
            type="button"
            onClick={() => set('visible', !form.visible)}
            className={`relative w-11 h-6 rounded-full transition-colors ${!form.visible ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'}`}
            aria-checked={!form.visible}
            role="switch"
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${!form.visible ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* 상세 추적 토글 (loan/savings는 강제 ON) */}
        <div className={`flex items-center justify-between py-0.5 ${forceTrackDetail ? 'opacity-50' : ''}`}>
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">상세 추적</p>
            <p className="text-xs text-[var(--color-text-sub)]">ON 시 목록 클릭이 상세 페이지로 이동</p>
          </div>
          <button
            type="button"
            onClick={() => !forceTrackDetail && set('track_detail', !form.track_detail)}
            disabled={forceTrackDetail}
            className={`relative w-11 h-6 rounded-full transition-colors ${(forceTrackDetail || form.track_detail) ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'}`}
            aria-checked={forceTrackDetail || form.track_detail}
            role="switch"
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${(forceTrackDetail || form.track_detail) ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {error && <p className="text-sm text-[var(--color-expense)] font-medium">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </SlideUpSheet>
  )
}
