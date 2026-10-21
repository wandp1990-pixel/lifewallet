import { ownerApi } from '@/lib/ledger-api'
import { NextRequest, NextResponse } from 'next/server'
import db, { initDb, rowToAsset } from '@/lib/db'
import { ledgerWrite, saveAsset, koreaToday } from '@/lib/ledger-service'
import { requestKey } from '@/lib/ledger-api'
export const dynamic = 'force-dynamic'

async function handleGET() {
  await initDb()
  const rows = await db.execute('SELECT * FROM assets ORDER BY ord ASC')
  return NextResponse.json(rows.rows.map(rowToAsset), { headers: { 'Cache-Control': 'no-store' } })
}

async function handlePOST(req: NextRequest) {
  const body = await req.json()
  const key = requestKey(req)
  const input = { ...body, balance: body.balance ?? 0, balance_date: body.balance_date || koreaToday(), start_date: body.start_date ?? '', end_date: body.end_date ?? '' }
  const result = await ledgerWrite('app.create_asset', key, input, tx => saveAsset(tx, key, input))
  return NextResponse.json(result.asset, { status: 201 })
}

export const GET = ownerApi(handleGET)
export const POST = ownerApi(handlePOST)
