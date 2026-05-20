import { NextRequest, NextResponse } from 'next/server'
import db, { applyTransactionBalance, reverseTransactionBalance } from '@/lib/db'
import type { Transaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [id] })
  if (!result.rows[0]) return NextResponse.json({ error: '해당 거래를 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json(result.rows[0], { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 거래를 찾을 수 없습니다' }, { status: 404 })

  const old = existing.rows[0] as unknown as Transaction
  await reverseTransactionBalance(old)

  const updated: Transaction = { ...old, ...body, id }
  await db.execute({
    sql: `UPDATE transactions SET date=?,type=?,amount=?,category_id=?,asset_id=?,content=?,note=?,from_asset_id=?,to_asset_id=?,fee=? WHERE id=?`,
    args: [updated.date, updated.type, updated.amount, updated.category_id, updated.asset_id, updated.content, updated.note, updated.from_asset_id, updated.to_asset_id, updated.fee, id],
  })
  await applyTransactionBalance(updated)

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const existing = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 거래를 찾을 수 없습니다' }, { status: 404 })

  await reverseTransactionBalance(existing.rows[0] as unknown as Transaction)
  await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [id] })

  return NextResponse.json({ ok: true })
}
