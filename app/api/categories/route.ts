import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateId } from '@/lib/utils'
import type { Category } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await db.execute('SELECT * FROM categories ORDER BY type, is_system DESC, ord ASC')
  return NextResponse.json(
    rows.rows.map(r => ({
      ...r,
      order: r.ord,
      visible: Boolean(r.visible),
      is_system: Boolean(r.is_system),
    })),
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
    visible: true,
    is_system: false,
    essentiality: body.essentiality ?? 'wants',
  }

  await db.execute({
    sql: 'INSERT INTO categories (id,type,name,icon,ord,visible,is_system,essentiality) VALUES (?,?,?,?,?,?,?,?)',
    args: [c.id, c.type, c.name, c.icon, c.order, 1, 0, c.essentiality],
  })

  return NextResponse.json(c, { status: 201 })
}
