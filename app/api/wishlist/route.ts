import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateId } from '@/lib/utils'
import type { WishlistItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await db.execute('SELECT * FROM wishlist ORDER BY created_at DESC')
  return NextResponse.json(
    rows.rows.map(r => ({ ...r, is_done: Boolean(r.is_done) })),
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: '항목 이름을 입력해주세요' }, { status: 400 })

  const w: WishlistItem = {
    id: generateId('wsh'),
    type: body.type ?? 'wish',
    name: body.name,
    price: body.price ?? 0,
    priority: body.priority ?? 2,
    target_date: body.target_date ?? '',
    is_done: false,
    memo: body.memo ?? '',
    created_at: new Date().toISOString(),
  }

  await db.execute({
    sql: 'INSERT INTO wishlist (id,type,name,price,priority,target_date,is_done,memo,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    args: [w.id, w.type, w.name, w.price, w.priority, w.target_date, 0, w.memo, w.created_at],
  })

  return NextResponse.json(w, { status: 201 })
}
