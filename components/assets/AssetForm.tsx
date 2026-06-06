'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import SlideUpSheet from '@/components/ui/SlideUpSheet'
import { getDebtBalance, isDebtAssetType } from '@/lib/finance'
import { useStore } from '@/lib/store'
import { formatAmount, todayStr } from '@/lib/utils'
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
  balance_date: string
  visible: boolean
  track_detail: boolean
  savings_tracking: boolean
  target_balance_enabled: boolean
  target_balance: string
  principal: string
  interest_rate: string
  start_date: string
  end_date: string
  payment_day: string
  monthly_payment: string
}

function assetToForm(asset: Asset): FormState {
  const displayBalance = isDebtAssetType(asset.group_type) ? getDebtBalance(asset.balance) : asset.balance
  return {
    name: asset.name,
    group_type: asset.group_type,
    group_name: asset.group_name,
    balance: displayBalance !== 0 ? formatAmount(displayBalance) : '',
    balance_date: asset.balance_date ?? '',
    visible: asset.visible,
    track_detail: asset.track_detail,
    savings_tracking: asset.savings_tracking,
    target_balance_enabled: asset.target_balance_enabled,
    target_balance: asset.target_balance ? formatAmount(asset.target_balance) : '',
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
  balance_date: todayStr(),
  visible: true,
  track_detail: false,
  savings_tracking: false,
  target_balance_enabled: false,
  target_balance: '',
  principal: '',
  interest_rate: '',
  start_date: '',
  end_date: '',
  payment_day: '',
  monthly_payment: '',
}

function ToggleSwitch({
  checked,
  onClick,
  disabled = false,
  label,
}: {
  checked: boolean
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-strong)]'
      } disabled:cursor-not-allowed`}
      aria-checked={checked}
      aria-label={label}
      role="switch"
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  editing: Asset | null
}

export default function AssetForm({ open, onClose, editing }: Props) {
  const { addAsset, updateAsset, categories } = useStore()
  const assetCategories = categories.filter(c => c.type === 'asset' && c.visible)
  const [form, setForm] = useState<FormState>(editing ? assetToForm(editing) : DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isLoan = form.group_type === 'loan'
  const forceTrackDetail = form.group_type === 'loan' || form.group_type === 'savings'
  const forceSavingsTracking = form.group_type === 'savings'

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
      balance_date: form.balance_date,
      visible: form.visible,
      track_detail: forceTrackDetail || form.track_detail,
      savings_tracking: forceSavingsTracking || form.savings_tracking,
      target_balance_enabled: form.target_balance_enabled,
      target_balance: form.target_balance_enabled ? parseNum(form.target_balance) : 0,
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
        const res = await fetch(`/api/assets/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? '저장 실패'); return }
        const updated: Asset = await res.json()
        updateAsset(updated)
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
    const res = await fetch(`/api/assets/${editing.id}`, { method: 'DELETE' })
    if (res.ok) {
      const updated: Asset = await res.json()
      updateAsset(updated)
      setShowDeleteConfirm(false)
      onClose()
    }
  }

  const deleteBtn = editing ? (
    <button
      type="button"
      onClick={() => setShowDeleteConfirm(true)}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-[var(--color-surface-sub)] transition-colors"
      aria-label="삭제"
    >
      <Trash2 size={18} className="text-[var(--color-expense)]" />
    </button>
  ) : undefined

  return (
    <>
    {showDeleteConfirm && editing && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(2,9,19,0.5)]">
        <div className="tds-slide-up bg-[var(--color-surface)] rounded-2xl p-6 mx-4 max-w-sm w-full shadow-[0px_8px_24px_rgba(0,0,0,0.16)]">
          <p className="text-[16px] font-semibold text-[var(--color-text)] mb-2">자산을 삭제할까요?</p>
          <p className="text-sm text-[var(--color-text-sub)] mb-6">
            &ldquo;{editing.name}&rdquo;은 목록에서 숨겨지고 연결된 거래는 그대로 유지됩니다.
          </p>
          <div className="flex gap-3">
            <button
              className="flex-1 h-12 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] text-[15px] font-medium"
              onClick={() => setShowDeleteConfirm(false)}
            >
              취소
            </button>
            <button
              className="flex-1 h-12 rounded-xl bg-[var(--color-expense)] text-white text-[15px] font-semibold"
              onClick={handleDelete}
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    )}
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
            list={assetCategories.length > 0 ? 'asset-category-names' : undefined}
            placeholder="예: 국민은행"
            className="tds-field"
          />
          {assetCategories.length > 0 && (
            <datalist id="asset-category-names">
              {assetCategories.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          )}
        </div>

        {/* 잔액 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">
            {isDebtAssetType(form.group_type) ? '부채 금액' : '잔액'}
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

        {/* 잔액 기준일 */}
        <div>
          <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">잔액 기준일</label>
          <input
            type="date"
            value={form.balance_date}
            onChange={e => set('balance_date', e.target.value)}
            className="tds-field"
          />
          <p className="mt-1 text-[11px] text-[var(--color-text-sub)]">이 날짜 이후 입력한 내역만 현재 잔액에 반영됩니다</p>
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
                  className="tds-field !py-2.5 !text-[16px] !px-3"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">만기일 (선택)</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => set('end_date', e.target.value)}
                  className="tds-field !py-2.5 !text-[16px] !px-3"
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
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '')
                    const n = parseInt(v, 10)
                    if (!v || (n >= 1 && n <= 31)) set('payment_day', v)
                  }}
                  placeholder="25"
                  className="tds-field !py-2.5 !text-[16px] !px-3"
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

        {/* 집계 토글 */}
        <div className="flex items-center justify-between py-0.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">집계 포함</p>
            <p className="text-xs text-[var(--color-text-sub)]">OFF 시 합계·대시보드에서만 제외</p>
          </div>
          <ToggleSwitch
            checked={form.visible}
            onClick={() => set('visible', !form.visible)}
            label="집계 포함"
          />
        </div>

        {/* 상세 추적 토글 (loan/savings는 강제 ON) */}
        <div className={`flex items-center justify-between py-0.5 ${forceTrackDetail ? 'opacity-50' : ''}`}>
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">상세 추적</p>
            <p className="text-xs text-[var(--color-text-sub)]">ON 시 목록 클릭이 상세 페이지로 이동</p>
          </div>
          <ToggleSwitch
            checked={forceTrackDetail || form.track_detail}
            onClick={() => !forceTrackDetail && set('track_detail', !form.track_detail)}
            disabled={forceTrackDetail}
            label="상세 추적"
          />
        </div>

        {/* 저축 추적 토글 (savings는 강제 ON) */}
        <div className={`flex items-center justify-between py-0.5 ${forceSavingsTracking ? 'opacity-50' : ''}`}>
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">저축 추적</p>
            <p className="text-xs text-[var(--color-text-sub)]">ON 시 재무보고서 저축 집계에 포함</p>
          </div>
          <ToggleSwitch
            checked={forceSavingsTracking || form.savings_tracking}
            onClick={() => !forceSavingsTracking && set('savings_tracking', !form.savings_tracking)}
            disabled={forceSavingsTracking}
            label="저축 추적"
          />
        </div>

        {/* 목표 잔액 토글 */}
        <div className="flex items-center justify-between py-0.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">목표 잔액</p>
            <p className="text-xs text-[var(--color-text-sub)]">ON 시 부족 금액을 자산 목록에 표시</p>
          </div>
          <ToggleSwitch
            checked={form.target_balance_enabled}
            onClick={() => set('target_balance_enabled', !form.target_balance_enabled)}
            label="목표 잔액"
          />
        </div>

        {form.target_balance_enabled && (
          <div>
            <label className="text-xs font-medium text-[var(--color-text-sub)] mb-1.5 block">목표 유지 금액</label>
            <div className="flex items-center gap-2 rounded-xl px-4 overflow-hidden" style={{ background: "rgba(0,23,51,0.02)", border: "1px solid rgba(2,32,71,0.05)" }}>
              <input
                type="text"
                inputMode="numeric"
                value={form.target_balance}
                onChange={e => set('target_balance', fmtInput(e.target.value))}
                placeholder="0"
                className="flex-1 min-w-0 text-right text-[22px] font-bold text-[var(--color-text)] bg-transparent py-3 outline-none placeholder:text-[var(--color-text-placeholder)]"
              />
              <span className="text-base font-bold text-[var(--color-text-sub)] shrink-0">원</span>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-[var(--color-expense)] font-medium">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full h-14 rounded-xl bg-[var(--color-primary)] text-white text-[15px] font-semibold hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </SlideUpSheet>
    </>
  )
}
