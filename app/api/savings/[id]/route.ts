import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM savings_goals WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 목표를 찾을 수 없습니다' }, { status: 404 })

  await db.execute({
    sql: `UPDATE savings_goals SET name=COALESCE(?,name), target_amount=COALESCE(?,target_amount),
          current_amount=COALESCE(?,current_amount), target_date=COALESCE(?,target_date),
          asset_id=COALESCE(?,asset_id), memo=COALESCE(?,memo) WHERE id=?`,
    args: [body.name ?? null, body.target_amount ?? null, body.current_amount ?? null, body.target_date ?? null, body.asset_id ?? null, body.memo ?? null, id],
  })

  const updated = await db.execute({ sql: 'SELECT * FROM savings_goals WHERE id = ?', args: [id] })
  return NextResponse.json(updated.rows[0])
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT * FROM savings_goals WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 목표를 찾을 수 없습니다' }, { status: 404 })

  await db.execute({ sql: 'DELETE FROM savings_goals WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
