'use client'

import { useState, useEffect, use } from 'react'
import TransactionForm from '@/components/transaction/TransactionForm'
import type { Transaction } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditTransactionPage({ params }: Props) {
  const { id } = use(params)
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/transactions/${id}`)
      .then(r => {
        if (!r.ok) { setNotFound(true); return null }
        return r.json()
      })
      .then((tx: Transaction | null) => {
        if (tx) setTransaction(tx)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-sm">불러오는 중…</p>
      </div>
    )
  }

  if (notFound || !transaction) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-sub)]">
        <p className="text-sm">거래를 찾을 수 없습니다</p>
      </div>
    )
  }

  return <TransactionForm mode="edit" initial={transaction} transactionId={id} />
}
