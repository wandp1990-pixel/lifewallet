import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM wishlist WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 항목을 찾을 수 없습니다' }, { status: 404 })

  await db.execute({
    sql: `UPDATE wishlist SET type=COALESCE(?,type), name=COALESCE(?,name), price=COALESCE(?,price),
          priority=COALESCE(?,priority), target_date=COALESCE(?,target_date),
          is_done=COALESCE(?,is_done), memo=COALESCE(?,memo) WHERE id=?`,
    args: [body.type ?? null, body.name ?? null, body.price ?? null, body.priority ?? null, body.target_date ?? null, body.is_done != null ? (body.is_done ? 1 : 0) : null, body.memo ?? null, id],
  })

  const updated = await db.execute({ sql: 'SELECT * FROM wishlist WHERE id = ?', args: [id] })
  const r = updated.rows[0] as Record<string, unknown>
  return NextResponse.json({ ...r, is_done: Boolean(r.is_done) })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT * FROM wishlist WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 항목을 찾을 수 없습니다' }, { status: 404 })

  await db.execute({ sql: 'DELETE FROM wishlist WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
