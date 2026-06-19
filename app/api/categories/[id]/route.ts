import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import type { Essentiality } from '@/lib/types'

const ESSENTIALITIES: Essentiality[] = ['needs', 'wants', 'savings', 'unexpected']

function isEssentiality(value: unknown): value is Essentiality {
  return typeof value === 'string' && ESSENTIALITIES.includes(value as Essentiality)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 카테고리를 찾을 수 없습니다' }, { status: 404 })
  if (body.essentiality !== undefined && !isEssentiality(body.essentiality)) {
    return NextResponse.json({ error: '지출 성격을 확인해주세요' }, { status: 400 })
  }

  await db.execute({
    sql: 'UPDATE categories SET name=COALESCE(?,name), icon=COALESCE(?,icon), ord=COALESCE(?,ord), visible=COALESCE(?,visible), essentiality=COALESCE(?,essentiality), budget_excluded=COALESCE(?,budget_excluded), default_asset_id=COALESCE(?,default_asset_id) WHERE id=?',
    args: [body.name ?? null, body.icon ?? null, body.order ?? null, body.visible === undefined ? null : body.visible ? 1 : 0, body.essentiality ?? null, body.budget_excluded === undefined ? null : body.budget_excluded ? 1 : 0, body.default_asset_id !== undefined ? body.default_asset_id : null, id],
  })

  const updated = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  const r = updated.rows[0] as Record<string, unknown>
  return NextResponse.json({ ...r, order: r.ord, visible: Boolean(r.visible), is_system: Boolean(r.is_system), budget_excluded: Boolean(r.budget_excluded), default_asset_id: r.default_asset_id ?? '' })
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
