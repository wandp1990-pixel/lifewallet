import { NextRequest, NextResponse } from 'next/server'
import db, { initDb, rowToAsset } from '@/lib/db'
import { getDebtBalance, isDebtAssetType, normalizeAssetBalance } from '@/lib/finance'
import { generateId, todayStr } from '@/lib/utils'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb()
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM assets WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 자산을 찾을 수 없습니다' }, { status: 404 })

  const currentGroupType = existing.rows[0].group_type as string
  const currentBalance = existing.rows[0].balance as number
  const nextGroupType = (body.group_type ?? currentGroupType) as Parameters<typeof normalizeAssetBalance>[0]
  const groupTypeChanged = body.group_type !== undefined && body.group_type !== currentGroupType

  if (groupTypeChanged) {
    const linkedTxs = await db.execute({
      sql: `SELECT 1 FROM transactions
            WHERE asset_id = ? OR from_asset_id = ? OR to_asset_id = ?
            LIMIT 1`,
      args: [id, id, id],
    })
    const linkedRecurring = await db.execute({
      sql: `SELECT 1 FROM recurring_transactions
            WHERE asset_id = ? OR from_asset_id = ? OR to_asset_id = ?
            LIMIT 1`,
      args: [id, id, id],
    })
    if (linkedTxs.rows.length || linkedRecurring.rows.length) {
      return NextResponse.json(
        { error: '연결된 거래가 있는 자산은 유형을 변경할 수 없습니다' },
        { status: 400 }
      )
    }
  }

  const currentDisplayBalance = isDebtAssetType(currentGroupType as Parameters<typeof normalizeAssetBalance>[0])
    ? getDebtBalance(currentBalance)
    : currentBalance
  const nextDisplayBalance = body.balance !== undefined ? body.balance : currentDisplayBalance
  const nextBalance = body.balance !== undefined || groupTypeChanged
    ? normalizeAssetBalance(nextGroupType, nextDisplayBalance)
    : null

  const resolvedGroupType = body.group_type ?? existing.rows[0].group_type
  const forceTrackDetail = resolvedGroupType === 'loan' || resolvedGroupType === 'savings'
  const forceSavingsTracking = resolvedGroupType === 'savings'

  await db.execute({
    sql: `UPDATE assets SET group_type=COALESCE(?,group_type), group_name=COALESCE(?,group_name), name=COALESCE(?,name),
          balance=COALESCE(?,balance), balance_date=COALESCE(?,balance_date), ord=COALESCE(?,ord), visible=COALESCE(?,visible),
          track_detail=CASE WHEN ? THEN 1 ELSE COALESCE(?,track_detail) END,
          savings_tracking=CASE WHEN ? THEN 1 ELSE COALESCE(?,savings_tracking) END,
          target_balance_enabled=COALESCE(?,target_balance_enabled),
          target_balance=COALESCE(?,target_balance),
          principal=COALESCE(?,principal), interest_rate=COALESCE(?,interest_rate),
          start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date),
          payment_day=COALESCE(?,payment_day), monthly_payment=COALESCE(?,monthly_payment)
          WHERE id=?`,
    args: [
      body.group_type ?? null, body.group_name ?? null, body.name ?? null,
      nextBalance, body.balance_date ?? null, body.order ?? null, body.visible != null ? (body.visible ? 1 : 0) : null,
      forceTrackDetail, body.track_detail != null ? (body.track_detail ? 1 : 0) : null,
      forceSavingsTracking, body.savings_tracking != null ? (body.savings_tracking ? 1 : 0) : null,
      body.target_balance_enabled != null ? (body.target_balance_enabled ? 1 : 0) : null,
      body.target_balance_enabled != null ? (body.target_balance_enabled ? (body.target_balance ?? 0) : 0) : null,
      body.principal ?? null, body.interest_rate ?? null,
      body.start_date ?? null, body.end_date ?? null,
      body.payment_day ?? null, body.monthly_payment ?? null,
      id,
    ],
  })

  // 잔액 조정 거래 날짜는 항상 오늘 — 기준일(balance_date) 이후로 찍혀야 자산 상세 활성 이력에 새 기록으로 올라간다.
  // 기준일과 같은 날짜로 찍으면 "기준일 이전·당일 · 잔액 미반영" 흐린 칸에 묻혀 기록이 추가되지 않은 것처럼 보인다. → PAGES.md "자산 추가/수정 폼"
  if (body.balance !== undefined && !groupTypeChanged && nextBalance !== null && nextBalance !== currentBalance) {
    await db.execute({
      sql: `INSERT INTO transactions (id,date,type,amount,category_id,asset_id,content,note,from_asset_id,to_asset_id,fee,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        generateId('txn'),
        todayStr(),
        'asset',
        nextBalance - currentBalance,
        '',
        id,
        '잔액 조정',
        '',
        '',
        '',
        0,
        new Date().toISOString(),
      ],
    })
  }

  const updated = await db.execute({ sql: 'SELECT * FROM assets WHERE id = ?', args: [id] })
  return NextResponse.json(rowToAsset(updated.rows[0] as Record<string, unknown>))
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDb()
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT * FROM assets WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 자산을 찾을 수 없습니다' }, { status: 404 })

  await db.execute({
    sql: `UPDATE assets
          SET visible = 0,
              track_detail = 0
          WHERE id = ?`,
    args: [id],
  })
  await db.execute({
    sql: `UPDATE recurring_transactions
          SET enabled = 0
          WHERE asset_id = ? OR from_asset_id = ? OR to_asset_id = ?`,
    args: [id, id, id],
  })
  const updated = await db.execute({ sql: 'SELECT * FROM assets WHERE id = ?', args: [id] })
  return NextResponse.json(rowToAsset(updated.rows[0] as Record<string, unknown>))
}
