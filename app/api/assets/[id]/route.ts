import { NextRequest, NextResponse } from 'next/server'
import db, { rowToAsset } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM assets WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 자산을 찾을 수 없습니다' }, { status: 404 })

  const forceTrackDetail = (body.group_type ?? existing.rows[0].group_type) === 'loan'
    || (body.group_type ?? existing.rows[0].group_type) === 'savings'

  await db.execute({
    sql: `UPDATE assets SET group_type=COALESCE(?,group_type), group_name=COALESCE(?,group_name), name=COALESCE(?,name),
          balance=COALESCE(?,balance), ord=COALESCE(?,ord), visible=COALESCE(?,visible),
          track_detail=CASE WHEN ? THEN 1 ELSE COALESCE(?,track_detail) END,
          principal=COALESCE(?,principal), interest_rate=COALESCE(?,interest_rate),
          start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date),
          payment_day=COALESCE(?,payment_day), monthly_payment=COALESCE(?,monthly_payment)
          WHERE id=?`,
    args: [
      body.group_type ?? null, body.group_name ?? null, body.name ?? null,
      body.balance ?? null, body.order ?? null, body.visible != null ? (body.visible ? 1 : 0) : null,
      forceTrackDetail, body.track_detail != null ? (body.track_detail ? 1 : 0) : null,
      body.principal ?? null, body.interest_rate ?? null,
      body.start_date ?? null, body.end_date ?? null,
      body.payment_day ?? null, body.monthly_payment ?? null,
      id,
    ],
  })

  const updated = await db.execute({ sql: 'SELECT * FROM assets WHERE id = ?', args: [id] })
  return NextResponse.json(rowToAsset(updated.rows[0] as Record<string, unknown>))
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT * FROM assets WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 자산을 찾을 수 없습니다' }, { status: 404 })

  await db.execute({ sql: 'DELETE FROM assets WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
