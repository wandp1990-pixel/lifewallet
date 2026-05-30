import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 카테고리를 찾을 수 없습니다' }, { status: 404 })

  await db.execute({
    sql: 'UPDATE categories SET name=COALESCE(?,name), icon=COALESCE(?,icon), ord=COALESCE(?,ord), visible=COALESCE(?,visible), essentiality=COALESCE(?,essentiality) WHERE id=?',
    args: [body.name ?? null, body.icon ?? null, body.order ?? null, body.visible === undefined ? null : body.visible ? 1 : 0, body.essentiality ?? null, id],
  })

  const updated = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  const r = updated.rows[0] as Record<string, unknown>
  return NextResponse.json({ ...r, order: r.ord, visible: Boolean(r.visible), is_system: Boolean(r.is_system) })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 카테고리를 찾을 수 없습니다' }, { status: 404 })

  // 연결 거래·반복거래 분류 비우기 후 삭제
  await db.execute({ sql: "UPDATE transactions SET category_id = '' WHERE category_id = ?", args: [id] })
  await db.execute({ sql: "UPDATE recurring_transactions SET category_id = '' WHERE category_id = ?", args: [id] })
  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
