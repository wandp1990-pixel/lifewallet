import { ownerApi } from '@/lib/ledger-api'
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { ledgerWrite, saveTransaction, withBalanceEffects } from '@/lib/ledger-service'
import { requestKey } from '@/lib/ledger-api'

export const dynamic = 'force-dynamic'

async function handleGET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const assetId = searchParams.get('asset_id')

  let rows
  if (assetId) {
    rows = await db.execute({
      sql: `SELECT * FROM transactions WHERE asset_id=? OR from_asset_id=? OR to_asset_id=?
            ORDER BY date DESC, created_at DESC`,
      args: [assetId, assetId, assetId],
    })
  } else {
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const from = fromParam ?? (year && month ? `${year}-${String(month).padStart(2, '0')}-01` : null)
    const to = toParam ?? (year && month ? `${year}-${String(month).padStart(2, '0')}-31` : null)
    if (from && to) {
      rows = await db.execute({
        sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
        args: [from, to],
      })
    } else {
      rows = await db.execute('SELECT * FROM transactions ORDER BY date DESC, created_at DESC')
    }
  }

  return NextResponse.json(await withBalanceEffects(rows.rows), { headers: { 'Cache-Control': 'no-store' } })
}

async function handlePOST(req: NextRequest) {
  const body = await req.json()
  const requestKeyValue = requestKey(req)
  const result = await ledgerWrite('app.create_transaction', requestKeyValue, body, tx => saveTransaction(tx, requestKeyValue, body))
  return NextResponse.json(result.transaction, { status: 201 })
}

export const GET = ownerApi(handleGET)
export const POST = ownerApi(handlePOST)
