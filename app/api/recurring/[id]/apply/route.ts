import { NextRequest, NextResponse } from 'next/server'
import db, { applyTransactionBalance } from '@/lib/db'
import { generateId } from '@/lib/utils'
import type { Transaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const targetMonth: string = body.month // "2026-05"

  const result = await db.execute({ sql: 'SELECT * FROM recurring_transactions WHERE id=?', args: [id] })
  if (!result.rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const r = result.rows[0] as Record<string, unknown>

  // 이미 이번 달 적용됨
  if (r.last_applied_month === targetMonth) {
    return NextResponse.json({ error: '이미 이번 달에 적용되었습니다' }, { status: 400 })
  }

  // 적용일: 해당 월의 day_of_month (없으면 오늘)
  const dayOfMonth = r.day_of_month as number
  const [yyyy, mm] = targetMonth.split('-')
  const maxDay = new Date(Number(yyyy), Number(mm), 0).getDate()
  const appliedDay = Math.min(dayOfMonth, maxDay)
  const appliedDate = `${yyyy}-${mm}-${String(appliedDay).padStart(2, '0')}`

  const t: Transaction = {
    id: generateId('txn'),
    date: appliedDate,
    type: r.type as Transaction['type'],
    amount: r.amount as number,
    category_id: r.category_id as string,
    asset_id: r.asset_id as string,
    content: r.content as string,
    note: r.note as string,
    from_asset_id: r.from_asset_id as string,
    to_asset_id: r.to_asset_id as string,
    fee: r.fee as number,
    created_at: new Date().toISOString(),
  }

  await db.execute({
    sql: `INSERT INTO transactions (id,date,type,amount,category_id,asset_id,content,note,from_asset_id,to_asset_id,fee,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [t.id, t.date, t.type, t.amount, t.category_id, t.asset_id, t.content, t.note, t.from_asset_id, t.to_asset_id, t.fee, t.created_at],
  })
  await applyTransactionBalance(t)

  await db.execute({
    sql: 'UPDATE recurring_transactions SET last_applied_month=? WHERE id=?',
    args: [targetMonth, id],
  })

  return NextResponse.json({ transaction: t, applied_month: targetMonth }, { status: 201 })
}
