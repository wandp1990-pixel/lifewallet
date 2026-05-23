import { NextRequest, NextResponse } from 'next/server'
import db, { applyTransactionBalance } from '@/lib/db'
import { validateTransactionInput } from '@/lib/finance'
import { generateId } from '@/lib/utils'
import type { Asset, Category, Transaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const assetId = searchParams.get('asset_id')

  let rows
  if (assetId) {
    rows = await db.execute({
      sql: `SELECT * FROM transactions WHERE asset_id=? OR from_asset_id=? OR to_asset_id=?
            ORDER BY date DESC, created_at DESC`,
      args: [assetId, assetId, assetId],
    })
  } else {
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const from = fromParam ?? (year && month ? `${year}-${String(month).padStart(2, '0')}-01` : null)
    const to = toParam ?? (year && month ? `${year}-${String(month).padStart(2, '0')}-31` : null)
    if (from && to) {
      rows = await db.execute({
        sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
        args: [from, to],
      })
    } else {
      rows = await db.execute('SELECT * FROM transactions ORDER BY date DESC, created_at DESC')
    }
  }

  return NextResponse.json(rows.rows, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const t: Transaction = {
    id: generateId('txn'),
    date: body.date,
    type: body.type,
    amount: body.amount,
    category_id: body.category_id ?? '',
    asset_id: body.asset_id ?? '',
    content: body.content ?? '',
    note: body.note ?? '',
    from_asset_id: body.from_asset_id ?? '',
    to_asset_id: body.to_asset_id ?? '',
    fee: body.fee ?? 0,
    created_at: new Date().toISOString(),
  }

  const assets = (await db.execute({ sql: 'SELECT id, group_type, visible, balance FROM assets' })).rows as unknown as Pick<Asset, 'id' | 'group_type' | 'visible' | 'balance'>[]
  const categories = (await db.execute({ sql: 'SELECT id, type, visible FROM categories' })).rows as unknown as Pick<Category, 'id' | 'type' | 'visible'>[]
  const validationError = validateTransactionInput(t, assets, categories, [])
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  await db.execute({
    sql: `INSERT INTO transactions (id,date,type,amount,category_id,asset_id,content,note,from_asset_id,to_asset_id,fee,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [t.id, t.date, t.type, t.amount, t.category_id, t.asset_id, t.content, t.note, t.from_asset_id, t.to_asset_id, t.fee, t.created_at],
  })
  await applyTransactionBalance(t)

  return NextResponse.json(t, { status: 201 })
}
