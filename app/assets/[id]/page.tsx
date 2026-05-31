'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Pencil } from 'lucide-react'
import { useStore } from '@/lib/store'
import { formatAmount, formatDate } from '@/lib/utils'
import { assetBalanceDelta, estimateLoanPayoff, getDebtBalance, getLoanRepaymentPrincipal, isDebtAssetType } from '@/lib/finance'
import AssetForm from '@/components/assets/AssetForm'
import type { Asset, Transaction } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

function LoanDetail({ assetId }: { assetId: string }) {
  const { assets } = useStore()
  const asset = assets.find(a => a.id === assetId)
  const [repayments, setRepayments] = useState<Transaction[]>([])

  useEffect(() => {
    fetch(`/api/transactions?asset_id=${assetId}`)
      .then(r => r.json())
      .then((txs: Transaction[]) => {
        setRepayments(txs.filter(t => t.type === 'loan_repayment' && t.to_asset_id === assetId))
      })
  }, [assetId])

  if (!asset) return null
  const payoff = estimateLoanPayoff({
    balance: asset.balance,
    annualInterestRate: asset.interest_rate ?? 0,
    monthlyPayment: asset.monthly_payment ?? 0,
    paymentDay: asset.payment_day ?? 0,
  })

  // 상환 직후 남은 잔액(러닝). repayments는 최신순 — 위에서부터 현재 잔액, 아래로 갈수록 상환 전이라 잔액이 큼.
  let remainingDebt = getDebtBalance(asset.balance)
  const repayRows = repayments.map(tx => {
    const principal = getLoanRepaymentPrincipal(tx)
    const after = remainingDebt
    remainingDebt += principal
    return { tx, principal, after }
  })

  return (
    <div className="space-y-4">
      {/* 대출 정보 카드 */}
      <div className="bg-[var(--color-surface-sub)] rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-[var(--color-text-sub)] uppercase tracking-wide">대출 정보</p>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          {asset.principal != null && asset.principal > 0 && (
            <>
              <span className="text-[var(--color-text-sub)]">원금</span>
              <span className="text-right font-medium text-[var(--color-text)]">{formatAmount(asset.principal)}원</span>
            </>
          )}
          {asset.interest_rate != null && asset.interest_rate > 0 && (
            <>
              <span className="text-[var(--color-text-sub)]">이자율</span>
              <span className="text-right font-medium text-[var(--color-text)]">{asset.interest_rate}%</span>
            </>
          )}
          {asset.start_date && (
            <>
              <span className="text-[var(--color-text-sub)]">시작일</span>
              <span className="text-right font-medium text-[var(--color-text)]">{asset.start_date}</span>
            </>
          )}
          {asset.end_date && (
            <>
              <span className="text-[var(--color-text-sub)]">등록 만기일</span>
              <span className="text-right font-medium text-[var(--color-text)]">{asset.end_date}</span>
            </>
          )}
          {asset.payment_day != null && asset.payment_day > 0 && (
            <>
              <span className="text-[var(--color-text-sub)]">상환일</span>
              <span className="text-right font-medium text-[var(--color-text)]">매월 {asset.payment_day}일</span>
            </>
          )}
          {asset.monthly_payment != null && asset.monthly_payment > 0 && (
            <>
              <span className="text-[var(--color-text-sub)]">월 상환액</span>
              <span className="text-right font-medium text-[var(--color-text)]">{formatAmount(asset.monthly_payment)}원</span>
            </>
          )}
          {asset.interest_rate != null && asset.interest_rate > 0 && getDebtBalance(asset.balance) > 0 && (
            <>
              <span className="text-[var(--color-text-sub)]">월 예상 이자</span>
              <span className="text-right font-medium text-[var(--color-text)]">{formatAmount(payoff.monthlyInterest)}원</span>
            </>
          )}
          {asset.monthly_payment != null && asset.monthly_payment > 0 && (
            <>
              <span className="text-[var(--color-text-sub)]">예상 원금 상환</span>
              <span className={`text-right font-medium ${payoff.firstPrincipalPayment > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-expense)]'}`}>
                {payoff.firstPrincipalPayment > 0 ? `${formatAmount(payoff.firstPrincipalPayment)}원` : '월 이자 이하'}
              </span>
              <span className="text-[var(--color-text-sub)]">예상 완납</span>
              <span className={`text-right font-medium ${payoff.status === 'ok' || payoff.status === 'paid_off' ? 'text-[var(--color-text)]' : 'text-[var(--color-expense)]'}`}>
                {payoff.status === 'ok'
                  ? `${payoff.estimatedPayoffDate} (${payoff.estimatedMonths}회)`
                  : payoff.status === 'paid_off'
                    ? '완납'
                    : '계산 불가'}
              </span>
            </>
          )}
          <span className="text-[var(--color-text-sub)]">남은 잔액</span>
          <span className="text-right font-semibold text-[var(--color-expense)]">{formatAmount(getDebtBalance(asset.balance))}원</span>
        </div>
      </div>

      {/* 상환 내역 */}
      <div className="bg-[var(--color-surface-sub)] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold text-[var(--color-text)]">상환 내역</p>
        </div>
        {repayments.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[var(--color-text-sub)]">
            상환 내역이 없습니다
          </div>
        ) : (
          repayRows.map(({ tx, principal, after }) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--color-text-body)]">{tx.content || '대출 상환'}</p>
                  <p className="text-xs text-[var(--color-text-sub)]">
                    {formatDate(tx.date)}
                    {tx.fee > 0 ? ` · 원금 ${formatAmount(principal)}원 · 이자 ${formatAmount(tx.fee)}원` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-semibold text-[var(--color-expense)]">-{formatAmount(tx.amount)}원</span>
                  <p className="text-xs text-[var(--color-text-sub)]">남은 잔액 {formatAmount(after)}원</p>
                </div>
              </div>
          ))
        )}
      </div>
    </div>
  )
}

function SavingsDetail({ assetId }: { assetId: string }) {
  const { assets, savingsGoals } = useStore()
  const asset = assets.find(a => a.id === assetId)
  const [history, setHistory] = useState<Transaction[]>([])
  const router = useRouter()

  useEffect(() => {
    fetch(`/api/transactions?asset_id=${assetId}`)
      .then(r => r.json())
      .then((txs: Transaction[]) => {
        setHistory(txs.filter(t => t.asset_id === assetId || t.from_asset_id === assetId || t.to_asset_id === assetId))
      })
  }, [assetId])

  if (!asset) return null

  const linkedGoals = savingsGoals.filter(g => g.asset_id === assetId)

  return (
    <div className="space-y-4">
      {/* 연결된 저축 목표 */}
      <div className="bg-[var(--color-surface-sub)] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold text-[var(--color-text)]">연결된 저축 목표</p>
          <button
            onClick={() => router.push('/savings')}
            className="text-xs text-[var(--color-primary)]"
          >
            + 목표 추가
          </button>
        </div>
        {linkedGoals.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[var(--color-text-sub)]">
            연결된 저축 목표가 없습니다
          </div>
        ) : (
          linkedGoals.map(goal => {
            const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0
            return (
              <div key={goal.id} className="px-4 py-3 border-b border-[var(--color-border)] last:border-b-0 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--color-text)]">{goal.name}</p>
                  {goal.target_date && (
                    <p className="text-xs text-[var(--color-text-sub)]">
                      {dDay(goal.target_date)}
                    </p>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-[var(--color-text-sub)]">
                  <span>{formatAmount(goal.current_amount)}원</span>
                  <span>{pct}% / {formatAmount(goal.target_amount)}원</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 입출금 내역 */}
      <BalanceHistory asset={asset} transactions={history} />
    </div>
  )
}

function dDay(dateStr: string): string {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return 'D-Day'
  return `목표일 ${Math.abs(diff)}일 지남`
}

function BalanceHistory({ asset, transactions }: { asset: Asset; transactions: Transaction[] }) {
  const isDebt = isDebtAssetType(asset.group_type)
  // 헤더 잔액 표기와 동일 규칙(부채는 절댓값)으로 잔액을 표시.
  const showBalance = (v: number) => formatAmount(isDebt ? getDebtBalance(v) : v)

  const cut = asset.balance_date
  // 기준일 이후 거래만 잔액에 반영(잔액 자동 계산 로직과 동일). 그 외는 참고용.
  const post = transactions.filter(t => !cut || t.date > cut)
  const pre = transactions.filter(t => cut && t.date <= cut)

  // post는 최신순(API: date DESC). 위에서부터 "거래 직후 잔액" = 현재 잔액에서 더 최신 거래 델타를 뺀 값.
  let running = asset.balance
  const postRows = post.map(tx => {
    const delta = assetBalanceDelta(tx, asset.id)
    const after = running
    running -= delta
    return { tx, delta, after }
  })
  const baselineAmount = running // 모든 post 델타를 되돌린 값 = 기준일 시점 잔액

  const deltaSpan = (delta: number) => {
    const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
    const color = delta > 0 ? 'text-[var(--color-income)]' : delta < 0 ? 'text-[var(--color-expense)]' : 'text-[var(--color-text-sub)]'
    return <span className={`text-sm font-semibold ${color}`}>{sign}{formatAmount(Math.abs(delta))}원</span>
  }

  return (
    <div className="bg-[var(--color-surface-sub)] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-semibold text-[var(--color-text)]">잔액 변동 이력</p>
      </div>

      {postRows.map(({ tx, delta, after }) => (
        <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <p className="text-sm text-[var(--color-text-body)] truncate">{tx.content || (tx.type === 'asset' ? '잔액 조정' : tx.type)}</p>
            <p className="text-xs text-[var(--color-text-sub)]">{formatDate(tx.date)}</p>
          </div>
          <div className="shrink-0 text-right">
            {deltaSpan(delta)}
            <p className="text-xs text-[var(--color-text-sub)]">잔액 {showBalance(after)}원</p>
          </div>
        </div>
      ))}

      {/* 기준선 행 — 시작점 */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--color-surface)]">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-text)]">초기 잔액</p>
          <p className="text-xs text-[var(--color-text-sub)]">
            {cut ? `기준일 ${formatDate(cut)}` : '기준일 없음'}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-[var(--color-text)]">{showBalance(baselineAmount)}원</span>
      </div>

      {/* 기준일 이전 거래 — 잔액 미반영(참고) */}
      {pre.length > 0 && (
        <>
          <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-sub)]">
            <p className="text-xs text-[var(--color-text-sub)]">기준일 이전 · 잔액 미반영</p>
          </div>
          {pre.map(tx => (
            <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] last:border-b-0 opacity-60">
              <div className="min-w-0">
                <p className="text-sm text-[var(--color-text-body)] truncate">{tx.content || (tx.type === 'asset' ? '잔액 조정' : tx.type)}</p>
                <p className="text-xs text-[var(--color-text-sub)]">{formatDate(tx.date)}</p>
              </div>
              {deltaSpan(assetBalanceDelta(tx, asset.id))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function GenericDetail({ assetId }: { assetId: string }) {
  const { assets } = useStore()
  const asset = assets.find(a => a.id === assetId)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    fetch(`/api/transactions?asset_id=${assetId}`)
      .then(r => r.json())
      .then((txs: Transaction[]) => setTransactions(txs))
  }, [assetId])

  if (!asset) return null
  return <BalanceHistory asset={asset} transactions={transactions} />
}

export default function AssetDetailPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const { assets, ready } = useStore()
  const [sheetOpen, setSheetOpen] = useState(false)

  const asset = assets.find(a => a.id === id)

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-sm">불러오는 중…</p>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-sm">자산을 찾을 수 없습니다</p>
      </div>
    )
  }

  if (!asset.track_detail) {
    router.replace('/assets')
    return null
  }

  return (
    <>
      <div className="flex flex-col">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)] transition-colors"
            >
              <ChevronLeft size={20} className="text-[var(--color-text)]" />
            </button>
            <div className="text-center">
              <h1 className="text-[17px] font-bold text-[var(--color-text)]">{asset.name}</h1>
              <p className={`text-lg font-bold ${['card', 'minus_account', 'loan', 'insurance'].includes(asset.group_type) ? 'text-[var(--color-expense)]' : 'text-[var(--color-text)]'}`}>
                {formatAmount(isDebtAssetType(asset.group_type) ? getDebtBalance(asset.balance) : asset.balance)}원
              </p>
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-sub)] transition-colors"
            >
              <Pencil size={18} className="text-[var(--color-text-sub)]" />
            </button>
          </div>
        </div>

        <div className="p-4">
          {asset.group_type === 'loan' ? (
            <LoanDetail assetId={id} />
          ) : asset.group_type === 'savings' ? (
            <SavingsDetail assetId={id} />
          ) : (
            <GenericDetail assetId={id} />
          )}
        </div>
      </div>

      <AssetForm
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={asset}
      />
    </>
  )
}
