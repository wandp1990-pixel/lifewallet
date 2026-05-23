import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { validateTransactionInput } from '@/lib/finance'
import type { RecurringTransaction, TransactionType } from '@/lib/types'
import type { InValue } from '@libsql/client'
import type { Asset } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const existing = await db.execute({ sql: 'SELECT * FROM recurring_transactions WHERE id=?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const nextValue = { ...(existing.rows[0] as Record<string, unknown>), ...body, id } as unknown as RecurringTransaction
  const assets = (await db.execute({ sql: 'SELECT id, group_type, visible, balance FROM assets' })).rows as unknown as Pick<Asset, 'id' | 'group_type' | 'visible' | 'balance'>[]
  const validationError = validateTransactionInput(nextValue, assets)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const fields: string[] = []
  const args: InValue[] = []

  if (body.type !== undefined) { fields.push('type=?'); args.push(body.type) }
  if (body.amount !== undefined) { fields.push('amount=?'); args.push(body.amount) }
  if (body.category_id !== undefined) { fields.push('category_id=?'); args.push(body.category_id) }
  if (body.asset_id !== undefined) { fields.push('asset_id=?'); args.push(body.asset_id) }
  if (body.from_asset_id !== undefined) { fields.push('from_asset_id=?'); args.push(body.from_asset_id) }
  if (body.to_asset_id !== undefined) { fields.push('to_asset_id=?'); args.push(body.to_asset_id) }
  if (body.content !== undefined) { fields.push('content=?'); args.push(body.content) }
  if (body.note !== undefined) { fields.push('note=?'); args.push(body.note) }
  if (body.fee !== undefined) { fields.push('fee=?'); args.push(body.fee) }
  if (body.day_of_month !== undefined) { fields.push('day_of_month=?'); args.push(body.day_of_month) }
  if (body.enabled !== undefined) { fields.push('enabled=?'); args.push(body.enabled ? 1 : 0) }
  if (body.last_applied_month !== undefined) { fields.push('last_applied_month=?'); args.push(body.last_applied_month) }

  if (fields.length === 0) return NextResponse.json({ error: 'no fields' }, { status: 400 })

  args.push(id)
  await db.execute({ sql: `UPDATE recurring_transactions SET ${fields.join(',')} WHERE id=?`, args })

  const row = await db.execute({ sql: 'SELECT * FROM recurring_transactions WHERE id=?', args: [id] })
  const r = row.rows[0] as Record<string, unknown>

  return NextResponse.json({
    id: r.id as string,
    type: r.type as TransactionType,
    amount: r.amount as number,
    category_id: r.category_id as string,
    asset_id: r.asset_id as string,
    from_asset_id: r.from_asset_id as string,
    to_asset_id: r.to_asset_id as string,
    content: r.content as string,
    note: r.note as string,
    fee: r.fee as number,
    day_of_month: r.day_of_month as number,
    enabled: Boolean(r.enabled),
    last_applied_month: r.last_applied_month as string,
    created_at: r.created_at as string,
  } satisfies RecurringTransaction)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.execute({ sql: 'DELETE FROM recurring_transactions WHERE id=?', args: [id] })
  return NextResponse.json({ ok: true })
}
