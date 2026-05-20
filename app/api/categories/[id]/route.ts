import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 카테고리를 찾을 수 없습니다' }, { status: 404 })

  await db.execute({
    sql: 'UPDATE categories SET name=COALESCE(?,name), icon=COALESCE(?,icon), ord=COALESCE(?,ord) WHERE id=?',
    args: [body.name ?? null, body.icon ?? null, body.order ?? null, id],
  })

  const updated = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  const r = updated.rows[0] as Record<string, unknown>
  return NextResponse.json({ ...r, order: r.ord })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 카테고리를 찾을 수 없습니다' }, { status: 404 })

  // PAGES.md 정책: 연결 거래의 category_id를 빈 문자열로 변경 (거래는 보존, 통계에서 '미분류'로 묶임)
  await db.execute({ sql: "UPDATE transactions SET category_id = '' WHERE category_id = ?", args: [id] })
  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
