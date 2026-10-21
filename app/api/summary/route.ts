import { ownerApi } from '@/lib/ledger-api'
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getOutflowAmount } from '@/lib/finance'
import type { Transaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function handleGET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  const from = fromParam ?? (year && month ? `${year}-${String(month).padStart(2, '0')}-01` : null)
  const to = toParam ?? (year && month ? `${year}-${String(month).padStart(2, '0')}-31` : null)

  if (!from || !to) {
    return NextResponse.json({ error: 'from/to 또는 year/month 파라미터가 필요합니다' }, { status: 400 })
  }

  const rows = await db.execute({
    sql: `SELECT type, amount, fee FROM transactions WHERE date >= ? AND date <= ?`,
    args: [from, to],
  })

  const values = rows.rows as unknown as { type: string; amount: number; fee?: number }[]
  const income = values.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amount, 0)
  const expense = values.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0)
  const outflow = getOutflowAmount(values as Transaction[])

  return NextResponse.json(
    { income, expense, outflow },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export const GET = ownerApi(handleGET)
