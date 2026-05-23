import { NextRequest, NextResponse } from 'next/server'
import db, { initDb } from '@/lib/db'
import { validateTransactionInput } from '@/lib/finance'
import { generateId } from '@/lib/utils'
import type { Asset, Category, RecurringTransaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

function rowToRecurring(row: Record<string, unknown>): RecurringTransaction {
  return {
    id: row.id as string,
    type: row.type as RecurringTransaction['type'],
    amount: row.amount as number,
    category_id: row.category_id as string,
    asset_id: row.asset_id as string,
    from_asset_id: row.from_asset_id as string,
    to_asset_id: row.to_asset_id as string,
    content: row.content as string,
    note: row.note as string,
    fee: row.fee as number,
    day_of_month: row.day_of_month as number,
    enabled: Boolean(row.enabled),
    last_applied_month: row.last_applied_month as string,
    created_at: row.created_at as string,
  }
}

export async function GET() {
  await initDb()
  const rows = await db.execute('SELECT * FROM recurring_transactions ORDER BY day_of_month ASC, created_at ASC')
  return NextResponse.json(rows.rows.map(rowToRecurring), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  await initDb()
  const body = await req.json()

  const r: RecurringTransaction = {
    id: generateId('rec'),
    type: body.type,
    amount: body.amount,
    category_id: body.category_id ?? '',
    asset_id: body.asset_id ?? '',
    from_asset_id: body.from_asset_id ?? '',
    to_asset_id: body.to_asset_id ?? '',
    content: body.content ?? '',
    note: body.note ?? '',
    fee: body.fee ?? 0,
    day_of_month: body.day_of_month ?? 1,
    enabled: true,
    last_applied_month: '',
    created_at: new Date().toISOString(),
  }

  const assets = (await db.execute({ sql: 'SELECT id, group_type, visible, balance FROM assets' })).rows as unknown as Pick<Asset, 'id' | 'group_type' | 'visible' | 'balance'>[]
  const categories = (await db.execute({ sql: 'SELECT id, type, visible FROM categories' })).rows as unknown as Pick<Category, 'id' | 'type' | 'visible'>[]
  const validationError = validateTransactionInput(r, assets, categories, [])
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  await db.execute({
    sql: `INSERT INTO recurring_transactions
          (id,type,amount,category_id,asset_id,from_asset_id,to_asset_id,content,note,fee,day_of_month,enabled,last_applied_month,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [r.id, r.type, r.amount, r.category_id, r.asset_id, r.from_asset_id, r.to_asset_id,
           r.content, r.note, r.fee, r.day_of_month, 1, r.last_applied_month, r.created_at],
  })

  return NextResponse.json(r, { status: 201 })
}
