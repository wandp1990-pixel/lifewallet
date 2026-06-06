import { NextRequest, NextResponse } from 'next/server'
import db, { initDb, rowToAsset } from '@/lib/db'
import { normalizeAssetBalance } from '@/lib/finance'
import { generateId, todayStr } from '@/lib/utils'
import type { Asset } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  await initDb()
  const rows = await db.execute('SELECT * FROM assets ORDER BY ord ASC')
  return NextResponse.json(rows.rows.map(rowToAsset), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  await initDb()
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: '자산 이름을 입력해주세요' }, { status: 400 })

  const forceTrackDetail = body.group_type === 'loan' || body.group_type === 'savings'
  const forceSavingsTracking = body.group_type === 'savings'

  const a: Asset = {
    id: generateId('ast'),
    group_type: body.group_type,
    group_name: body.group_name ?? '',
    name: body.name,
    balance: normalizeAssetBalance(body.group_type, body.balance ?? 0),
    balance_date: body.balance_date || todayStr(),
    order: body.order ?? 0,
    visible: body.visible ?? true,
    track_detail: forceTrackDetail || (body.track_detail ?? false),
    savings_tracking: forceSavingsTracking || (body.savings_tracking ?? false),
    target_balance_enabled: body.target_balance_enabled ?? false,
    target_balance: body.target_balance_enabled ? (body.target_balance ?? 0) : 0,
    principal: body.principal,
    interest_rate: body.interest_rate,
    start_date: body.start_date,
    end_date: body.end_date,
    payment_day: body.payment_day,
    monthly_payment: body.monthly_payment,
  }

  await db.execute({
    sql: `INSERT INTO assets (id,group_type,group_name,name,balance,balance_date,ord,visible,track_detail,savings_tracking,target_balance_enabled,target_balance,principal,interest_rate,start_date,end_date,payment_day,monthly_payment)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [a.id, a.group_type, a.group_name, a.name, a.balance, a.balance_date, a.order, a.visible ? 1 : 0, a.track_detail ? 1 : 0, a.savings_tracking ? 1 : 0, a.target_balance_enabled ? 1 : 0, a.target_balance, a.principal ?? 0, a.interest_rate ?? 0, a.start_date ?? '', a.end_date ?? '', a.payment_day ?? 0, a.monthly_payment ?? 0],
  })

  return NextResponse.json(a, { status: 201 })
}
