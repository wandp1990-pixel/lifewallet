import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateId } from '@/lib/utils'
import type { Category } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await db.execute('SELECT * FROM categories ORDER BY type, ord ASC')
  return NextResponse.json(
    rows.rows.map(r => ({ ...r, order: r.ord })),
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: '카테고리 이름을 입력해주세요' }, { status: 400 })

  const c: Category = {
    id: generateId('cat'),
    type: body.type,
    name: body.name,
    icon: body.icon ?? '',
    order: body.order ?? 0,
  }

  await db.execute({
    sql: 'INSERT INTO categories (id,type,name,icon,ord) VALUES (?,?,?,?,?)',
    args: [c.id, c.type, c.name, c.icon, c.order],
  })

  return NextResponse.json(c, { status: 201 })
}
