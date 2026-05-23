import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 카테고리를 찾을 수 없습니다' }, { status: 404 })

  await db.execute({
    sql: 'UPDATE categories SET name=COALESCE(?,name), icon=COALESCE(?,icon), ord=COALESCE(?,ord), visible=COALESCE(?,visible) WHERE id=?',
    args: [body.name ?? null, body.icon ?? null, body.order ?? null, body.visible === undefined ? null : body.visible ? 1 : 0, id],
  })

  const updated = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  const r = updated.rows[0] as Record<string, unknown>
  return NextResponse.json({ ...r, order: r.ord, visible: Boolean(r.visible), is_system: Boolean(r.is_system) })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 카테고리를 찾을 수 없습니다' }, { status: 404 })

  const row = existing.rows[0] as Record<string, unknown>
  const isSystem = Boolean(row.is_system)

  if (isSystem) {
    await db.execute({ sql: 'UPDATE categories SET visible = 0 WHERE id = ?', args: [id] })
    return NextResponse.json({ ok: true, hidden: true })
  }

  // 사용자 카테고리는 실제 삭제. 연결 거래는 보존하고 분류만 비움.
  await db.execute({ sql: "UPDATE transactions SET category_id = '' WHERE category_id = ?", args: [id] })
  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true, deleted: true })
}
