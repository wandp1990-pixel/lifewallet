'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Pencil } from 'lucide-react'
import { useStore } from '@/lib/store'
import { formatAmount, formatDate } from '@/lib/utils'
import AssetForm from '@/components/assets/AssetForm'
import type { Transaction } from '@/lib/types'

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
              <span className="text-[var(--color-text-sub)]">만기일</span>
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
          <span className="text-[var(--color-text-sub)]">남은 잔액</span>
          <span className="text-right font-semibold text-[var(--color-expense)]">{formatAmount(asset.balance)}원</span>
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
          repayments.map(tx => (
            <div key={tx.id} className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-b-0">
              <div>
                <p className="text-sm text-[var(--color-text-body)]">{tx.content || '대출 상환'}</p>
                <p className="text-xs text-[var(--color-text-sub)]">{formatDate(tx.date)}</p>
              </div>
              <span className="text-sm font-semibold text-[var(--color-income)]">-{formatAmount(tx.amount)}원</span>
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
      <BalanceHistory assetId={assetId} transactions={history} />
    </div>
  )
}

function dDay(dateStr: string): string {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return 'D-Day'
  return `목표일 ${Math.abs(diff)}일 지남`
}

function BalanceHistory({ assetId, transactions }: { assetId: string; transactions: Transaction[] }) {
  return (
    <div className="bg-[var(--color-surface-sub)] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <p className="text-sm font-semibold text-[var(--color-text)]">잔액 변동 이력</p>
      </div>
      {transactions.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[var(--color-text-sub)]">
          내역이 없습니다
        </div>
      ) : (
        transactions.map(tx => {
          const isOut = tx.type === 'expense' || tx.from_asset_id === assetId
          const isAsset = tx.type === 'asset'
          const amountSign = isAsset
            ? (tx.amount >= 0 ? '+' : '')
            : isOut ? '-' : '+'
          const amountColor = isAsset
            ? (tx.amount >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]')
            : isOut
              ? 'text-[var(--color-expense)]'
              : 'text-[var(--color-income)]'
          return (
            <div key={tx.id} className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-b-0">
              <div>
                <p className="text-sm text-[var(--color-text-body)]">{tx.content || (tx.type === 'asset' ? '잔액 조정' : tx.type)}</p>
                <p className="text-xs text-[var(--color-text-sub)]">{formatDate(tx.date)}</p>
              </div>
              <span className={`text-sm font-semibold ${amountColor}`}>
                {amountSign}{formatAmount(Math.abs(tx.amount))}원
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

function GenericDetail({ assetId }: { assetId: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    fetch(`/api/transactions?asset_id=${assetId}`)
      .then(r => r.json())
      .then((txs: Transaction[]) => setTransactions(txs))
  }, [assetId])

  return <BalanceHistory assetId={assetId} transactions={transactions} />
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
                {formatAmount(asset.balance)}원
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
