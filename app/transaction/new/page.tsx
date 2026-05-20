'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import TransactionForm from '@/components/transaction/TransactionForm'
import { todayStr } from '@/lib/utils'
import type { Transaction } from '@/lib/types'

function NewTransactionContent() {
  const searchParams = useSearchParams()
  const copyId = searchParams.get('copy')
  const queryType = searchParams.get('type')
  const queryAmount = searchParams.get('amount')
  const queryContent = searchParams.get('content')

  const [initial, setInitial] = useState<Partial<Transaction> | undefined>(undefined)
  const [loading, setLoading] = useState(!!copyId)

  useEffect(() => {
    if (copyId) {
      fetch(`/api/transactions/${copyId}`)
        .then(r => r.ok ? r.json() : null)
        .then((tx: Transaction | null) => {
          if (tx) setInitial({ ...tx, id: undefined as unknown as string, date: todayStr() })
        })
        .finally(() => setLoading(false))
      return
    }

    // 위시리스트 등 외부에서 쿼리 파람으로 폼 초기값을 주입하는 경우
    if (queryType || queryAmount || queryContent) {
      const partial: Partial<Transaction> = { date: todayStr() }
      if (queryType === 'expense' || queryType === 'income' || queryType === 'transfer' || queryType === 'loan_repayment') {
        partial.type = queryType
      }
      if (queryAmount) partial.amount = Number(queryAmount) || 0
      if (queryContent) partial.content = queryContent
      setInitial(partial)
    }
  }, [copyId, queryType, queryAmount, queryContent])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-sm">불러오는 중…</p>
      </div>
    )
  }

  return <TransactionForm mode="new" initial={initial} />
}

export default function NewTransactionPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-sm">불러오는 중…</p>
      </div>
    }>
      <NewTransactionContent />
    </Suspense>
  )
}
